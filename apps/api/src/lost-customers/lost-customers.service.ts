import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type StoreMembership, type User } from "@massage-note/database";
import type { CreateLostCustomerInput, DeleteLostCustomerInput, UpdateLostCustomerInput } from "@massage-note/contracts";
import { canWriteWorkRecord, hasStoreCapability } from "@massage-note/domain";
import { businessDateFor, deviceNow, deviceTimezone } from "../common/device-time.js";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class LostCustomersService {
  constructor(private readonly prisma: PrismaService, private readonly access: StoreAccessService, private readonly idempotency: IdempotencyService) {}

  async list(actor: User, storeId: string, query: { businessDate: string }) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    const store = await this.prisma.store.findFirst({ where: { id: storeId, status: "ACTIVE", deletedAt: null }, select: { timezone: true, businessCutoffLocal: true } });
    if (!store) throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在或已停用" });
    const currentDate = businessDateFor({ startAt: deviceNow(), timezone: deviceTimezone(store.timezone), cutoffLocal: store.businessCutoffLocal });
    const personalHistory = query.businessDate !== currentDate && !hasStoreCapability(membership.role, "FINANCE_READ_STORE");
    if (personalHistory) throw new ForbiddenException({ code: "LOST_CUSTOMER_HISTORY_FORBIDDEN", messageZh: "普通员工只能查看当前营业日的跑客记录" });
    const rows = await this.prisma.lostCustomer.findMany({ where: { storeId, businessDate: dateAtUtc(query.businessDate), deletedAt: null }, orderBy: [{ occurredTime: "asc" }, { createdAt: "asc" }] });
    return rows.map((row) => this.serialize(row));
  }

  async create(actor: User, storeId: string, input: CreateLostCustomerInput, key: string, requestId: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/lost-customers", payload: input, responseCode: 201 }, async (tx) => {
      await this.assertCanWrite(tx, membership, storeId, input.businessDate);
      const row = await tx.lostCustomer.create({ data: { storeId, businessDate: dateAtUtc(input.businessDate), occurredTime: input.occurredTime, note: input.note ?? "", customerCount: input.customerCount ?? 1, createdBy: actor.id, updatedBy: actor.id } });
      await tx.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api", action: "lost_customer.created", entityType: "lost_customer", entityId: row.id, businessDate: row.businessDate, afterJson: this.snapshot(row), requestId } });
      return this.serialize(row);
    });
  }

  async update(actor: User, storeId: string, id: string, input: UpdateLostCustomerInput, key: string, requestId: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/lost-customers/:id", payload: { id, input }, responseCode: 200 }, async (tx) => {
      const current = await tx.lostCustomer.findFirst({ where: { id, storeId, deletedAt: null } });
      if (!current) this.notFound();
      await this.assertCanWrite(tx, membership, storeId, dateOnly(current.businessDate));
      const changed = await tx.lostCustomer.updateMany({ where: { id, storeId, deletedAt: null, version: input.version }, data: { occurredTime: input.occurredTime, ...(input.note === undefined ? {} : { note: input.note }), ...(input.customerCount === undefined ? {} : { customerCount: input.customerCount }), updatedBy: actor.id, version: { increment: 1 } } });
      if (changed.count !== 1) this.versionConflict();
      const updated = await tx.lostCustomer.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api", action: "lost_customer.updated", entityType: "lost_customer", entityId: id, businessDate: current.businessDate, beforeJson: this.snapshot(current), afterJson: this.snapshot(updated), requestId } });
      return this.serialize(updated);
    });
  }

  async remove(actor: User, storeId: string, id: string, input: DeleteLostCustomerInput, key: string, requestId: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/lost-customers/:id/delete", payload: { id, input }, responseCode: 200 }, async (tx) => {
      const current = await tx.lostCustomer.findFirst({ where: { id, storeId, deletedAt: null } });
      if (!current) this.notFound();
      await this.assertCanWrite(tx, membership, storeId, dateOnly(current.businessDate));
      const changed = await tx.lostCustomer.updateMany({ where: { id, storeId, deletedAt: null, version: input.version }, data: { deletedAt: new Date(), deletedBy: actor.id, updatedBy: actor.id, version: { increment: 1 } } });
      if (changed.count !== 1) this.versionConflict();
      const deleted = await tx.lostCustomer.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api", action: "lost_customer.deleted", entityType: "lost_customer", entityId: id, businessDate: current.businessDate, beforeJson: this.snapshot(current), afterJson: { ...this.snapshot(deleted), deletedAt: deleted.deletedAt?.toISOString() }, requestId } });
      return this.serialize(deleted);
    });
  }

  private async assertCanWrite(tx: Prisma.TransactionClient, membership: StoreMembership, storeId: string, businessDate: string) {
    await lockBusinessDay(tx, storeId, businessDate);
    const [store, closing] = await Promise.all([
      tx.store.findFirst({ where: { id: storeId, status: "ACTIVE", deletedAt: null }, select: { timezone: true, businessCutoffLocal: true } }),
      tx.businessDayClosing.findFirst({ where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" }, select: { id: true } }),
    ]);
    if (!store) throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在或已停用" });
    const current = businessDateFor({ startAt: deviceNow(), timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
    if (businessDate > current) throw new BadRequestException({ code: "LOST_CUSTOMER_FUTURE_DATE", messageZh: "不能记录尚未发生的营业日" });
    if (!canWriteWorkRecord({ role: membership.role, isCurrentBusinessDay: current === businessDate, isDayClosed: Boolean(closing) })) {
      throw new ConflictException({ code: closing ? "BUSINESS_DAY_CLOSED" : "LOST_CUSTOMER_WRITE_FORBIDDEN", messageZh: closing ? "该营业日已经日结，请先取消日结再修改跑客记录" : "普通员工只能修改当前营业日的跑客记录" });
    }
  }

  private serialize(row: { id: string; storeId: string; businessDate: Date; occurredTime: string; note: string; customerCount: number; version: number }) {
    return { id: row.id, storeId: row.storeId, businessDate: dateOnly(row.businessDate), occurredTime: row.occurredTime, note: row.note, customerCount: row.customerCount, version: row.version };
  }
  private snapshot(row: { id: string; storeId: string; businessDate: Date; occurredTime: string; note: string; customerCount: number; version: number }) { return this.serialize(row); }
  private notFound(): never { throw new NotFoundException({ code: "LOST_CUSTOMER_NOT_FOUND", messageZh: "跑客记录不存在" }); }
  private versionConflict(): never { throw new ConflictException({ code: "LOST_CUSTOMER_VERSION_CONFLICT", messageZh: "跑客记录已被修改，请刷新后重试" }); }
}
