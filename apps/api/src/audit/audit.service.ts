import { Injectable } from "@nestjs/common";
import type { User } from "@massage-note/database";
import type { AuditLogQuery } from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async list(actor: User, storeId: string, query: AuditLogQuery) {
    await this.access.requireCapability(actor.id, storeId, "AUDIT_READ_STORE");
    const dateFrom = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
    const dateTo = query.dateTo ? new Date(`${query.dateTo}T00:00:00.000Z`) : undefined;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        storeId,
        ...(query.dateFrom || query.dateTo
          ? {
              businessDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.actorMembershipId
          ? { actorMembershipId: query.actorMembershipId }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const actorIds = [...new Set(page.flatMap((row) => row.actorMembershipId ? [row.actorMembershipId] : []))];
    const memberships = actorIds.length
      ? await this.prisma.storeMembership.findMany({
          where: { storeId, id: { in: actorIds } },
          select: { id: true, displayName: true, role: true },
        })
      : [];
    const actorById = new Map(memberships.map((membership) => [membership.id, membership]));
    return {
      items: page.map((row) => ({
        ...row,
        actor: row.actorMembershipId ? actorById.get(row.actorMembershipId) ?? null : null,
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }
}
