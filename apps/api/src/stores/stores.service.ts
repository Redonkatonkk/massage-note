import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  CreateJoinRequestInput,
  CreateStore,
} from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { normalizeDisplayName, profileDisplayName } from "./display-name.js";

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    return this.prisma.storeMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        deletedAt: null,
        store: { status: "ACTIVE", deletedAt: null },
      },
      orderBy: { joinedAt: "asc" },
      select: {
        id: true,
        role: true,
        displayName: true,
        isServiceProvider: true,
        store: {
          select: {
            id: true,
            storeCode: true,
            name: true,
            timezone: true,
            businessCutoffLocal: true,
            globalCommissionBps: true,
            status: true,
            version: true,
          },
        },
      },
    });
  }

  async create(user: User, input: CreateStore, requestId: string) {
    const displayName = profileDisplayName(user);
    if (!displayName) {
      throw new BadRequestException({
        code: "PROFILE_REQUIRED",
        messageZh: "请先填写姓名，再创建店铺",
      });
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
          const store = await transaction.store.create({
            data: {
              storeCode: input.storeCode,
              name: input.name,
              timezone: input.timezone,
              businessCutoffLocal: input.businessCutoffLocal,
              globalCommissionBps: input.globalCommissionBps,
              status: "ACTIVE",
            },
          });
          const membership = await transaction.storeMembership.create({
            data: {
              storeId: store.id,
              userId: user.id,
              role: "OWNER",
              displayName,
              displayNameNormalized: normalizeDisplayName(displayName),
              isServiceProvider: true,
            },
          });
          const activeStore = await transaction.store.update({
            where: { id: store.id },
            data: { ownerMembershipId: membership.id },
          });
          await transaction.auditLog.create({
            data: {
              storeId: store.id,
              actorUserId: user.id,
              actorMembershipId: membership.id,
              source: "api",
              action: "store.created",
              entityType: "store",
              entityId: store.id,
              afterJson: {
                name: activeStore.name,
                storeCode: activeStore.storeCode,
                timezone: activeStore.timezone,
                businessCutoffLocal: activeStore.businessCutoffLocal,
                globalCommissionBps: activeStore.globalCommissionBps,
              },
              requestId,
            },
          });
          return { store: activeStore, membership };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        this.isStoreCodeCollision(error)
      ) {
        const existingStore = await this.prisma.store.findFirst({
          where: {
            storeCode: input.storeCode,
            status: "ACTIVE",
            deletedAt: null,
            memberships: {
              some: {
                userId: user.id,
                role: "OWNER",
                status: "ACTIVE",
                deletedAt: null,
              },
            },
          },
        });
        if (
          existingStore &&
          existingStore.name === input.name &&
          existingStore.timezone === input.timezone &&
          existingStore.businessCutoffLocal === input.businessCutoffLocal &&
          existingStore.globalCommissionBps === input.globalCommissionBps
        ) {
          const existingMembership = await this.prisma.storeMembership.findFirst({
            where: {
              storeId: existingStore.id,
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
              deletedAt: null,
            },
          });
          if (existingMembership) {
            return { store: existingStore, membership: existingMembership };
          }
        }
        throw new ConflictException({
          code: "STORE_CODE_TAKEN",
          messageZh: "这个 6 位店铺代码已被使用，请换一个代码",
        });
      }
      throw error;
    }
  }

  async resolveCode(storeCode: string) {
    const store = await this.prisma.store.findFirst({
      where: { storeCode, status: "ACTIVE", deletedAt: null },
      select: { id: true, storeCode: true, name: true },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_CODE_NOT_FOUND",
        messageZh: "没有找到这个店铺代码",
      });
    }
    return store;
  }

  async requestToJoin(
    user: User,
    storeId: string,
    input: CreateJoinRequestInput,
    requestId: string,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        messageZh: "店铺不存在或已停用",
      });
    }

    const existingMembership = await this.prisma.storeMembership.findFirst({
      where: { storeId, userId: user.id },
      select: { id: true, status: true, deletedAt: true },
    });
    if (
      existingMembership?.status === "ACTIVE" &&
      existingMembership.deletedAt === null
    ) {
      throw new ConflictException({
        code: "ALREADY_STORE_MEMBER",
        messageZh: "你已经是这家店的成员",
      });
    }

    if (!existingMembership) {
      const claimedMembership = await this.claimEmployeeAccount(
        user,
        storeId,
        requestId,
      );
      if (claimedMembership) {
        return { autoMatched: true as const, membership: claimedMembership };
      }
      const concurrentlyClaimed = await this.prisma.storeMembership.findFirst({
        where: {
          storeId,
          userId: user.id,
          status: "ACTIVE",
          deletedAt: null,
        },
      });
      if (concurrentlyClaimed) {
        return {
          autoMatched: true as const,
          membership: concurrentlyClaimed,
        };
      }
    }

    const pending = await this.prisma.storeJoinRequest.findFirst({
      where: { storeId, userId: user.id, status: "PENDING" },
    });
    if (pending) return { ...pending, autoMatched: false as const };

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const joinRequest = await transaction.storeJoinRequest.create({
          data: {
            storeId,
            userId: user.id,
            requestedDisplayName: input.displayName,
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: user.id,
            source: "api",
            action: "membership.join_requested",
            entityType: "store_join_request",
            entityId: joinRequest.id,
            afterJson: { requestedDisplayName: input.displayName },
            requestId,
          },
        });
        return { ...joinRequest, autoMatched: false as const };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.storeJoinRequest.findFirst({
          where: { storeId, userId: user.id, status: "PENDING" },
        });
        if (existing) return { ...existing, autoMatched: false as const };
      }
      throw error;
    }
  }

  private async claimEmployeeAccount(
    user: User,
    storeId: string,
    requestId: string,
  ) {
    if (!user.firstName?.trim()) return null;
    const normalizedRegisteredName = normalizeDisplayName(user.firstName);

    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.storeMembership.findFirst({
        where: {
          storeId,
          userId: null,
          status: "ACTIVE",
          deletedAt: null,
          displayNameNormalized: normalizedRegisteredName,
        },
      });
      if (!membership) return null;

      const claimed = await transaction.storeMembership.updateMany({
        where: {
          id: membership.id,
          storeId,
          userId: null,
          status: "ACTIVE",
          deletedAt: null,
          version: membership.version,
        },
        data: {
          userId: user.id,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) return null;

      const updated = await transaction.storeMembership.findUniqueOrThrow({
        where: { id: membership.id },
      });
      await transaction.storeJoinRequest.updateMany({
        where: { storeId, userId: user.id, status: "PENDING" },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewNote: "同名员工账号已自动匹配",
          version: { increment: 1 },
        },
      });
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId: user.id,
          actorMembershipId: updated.id,
          source: "api",
          action: "membership.account_claimed",
          entityType: "store_membership",
          entityId: updated.id,
          beforeJson: {
            id: membership.id,
            userId: null,
            role: membership.role,
            displayName: membership.displayName,
            status: membership.status,
            version: membership.version,
          },
          afterJson: {
            id: updated.id,
            userId: updated.userId,
            role: updated.role,
            displayName: updated.displayName,
            status: updated.status,
            version: updated.version,
          },
          requestId,
        },
      });
      return updated;
    });
  }

  private isStoreCodeCollision(error: Prisma.PrismaClientKnownRequestError): boolean {
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.some((item) => String(item).includes("store_code"))
      : String(target ?? "").includes("store_code");
  }
}
