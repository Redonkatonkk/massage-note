import { createHash, randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import { EMPLOYEE_SETTLEMENT_SHARE_TTL_MS, type CreateEmployeeSettlementShareInput } from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { EmployeeSettlementsService } from "./employee-settlements.service.js";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class EmployeeSettlementSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
    private readonly settlements: EmployeeSettlementsService,
  ) {}

  async create(actor: User, storeId: string, input: CreateEmployeeSettlementShareInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    return this.idempotency.execute({
      storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/employee-settlements/shares",
      payload: input, responseCode: 201, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    }, async tx => {
      const preview = await this.settlements.buildPreview(storeId, input, tx);
      // Share only statement fields, never payroll revisions, recipients or internal membership IDs.
      const { storeId: _storeId, employee, ...statement } = preview;
      const snapshot = { ...statement, employee: { displayName: employee.displayName } };
      const token = randomBytes(32).toString("base64url");
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + EMPLOYEE_SETTLEMENT_SHARE_TTL_MS);
      const share = await tx.employeeSettlementShare.create({ data: {
        storeId, tokenHash: hash(token), snapshotJson: snapshot as unknown as Prisma.InputJsonValue, createdAt, expiresAt,
      } });
      await tx.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api",
        action: "employee_settlement.share_created", entityType: "employee_settlement_share", entityId: share.id,
        afterJson: { ...input, expiresAt: expiresAt.toISOString() }, requestId,
      } });
      return { token, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(), employeeName: snapshot.employee.displayName, dateFrom: snapshot.dateFrom, dateTo: snapshot.dateTo, totalIncomeCents: snapshot.summary.totalIncomeCents };
    });
  }

  async read(token: string) {
    const share = await this.prisma.employeeSettlementShare.findFirst({
      where: { tokenHash: hash(token), expiresAt: { gt: new Date() }, store: { status: "ACTIVE", deletedAt: null } },
      select: { snapshotJson: true, createdAt: true, expiresAt: true },
    });
    if (!share) throw new NotFoundException({ code: "SETTLEMENT_SHARE_UNAVAILABLE", messageZh: "分享链接已过期或不存在，请联系发送人重新生成" });
    return { snapshot: share.snapshotJson, createdAt: share.createdAt.toISOString(), expiresAt: share.expiresAt.toISOString() };
  }
}
