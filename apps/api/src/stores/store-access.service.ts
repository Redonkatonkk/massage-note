import { ForbiddenException, Injectable } from "@nestjs/common";
import type { StoreCapability } from "@massage-note/domain";
import { hasStoreCapability } from "@massage-note/domain";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class StoreAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireActiveMembership(userId: string, storeId: string) {
    const membership = await this.prisma.storeMembership.findFirst({
      where: {
        storeId,
        userId,
        status: "ACTIVE",
        deletedAt: null,
        store: { status: "ACTIVE", deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: "ACTIVE_MEMBERSHIP_REQUIRED",
        messageZh: "你不是这家店的在职成员",
      });
    }
    return membership;
  }

  async requireCapability(
    userId: string,
    storeId: string,
    capability: StoreCapability,
  ) {
    const membership = await this.requireActiveMembership(userId, storeId);
    if (!hasStoreCapability(membership.role, capability)) {
      throw new ForbiddenException({
        code: "STORE_CAPABILITY_REQUIRED",
        messageZh: "你没有执行此操作的权限",
      });
    }
    return membership;
  }
}
