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

    const activeMembership = await this.prisma.storeMembership.findFirst({
      where: { storeId, userId: user.id, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (activeMembership) {
      throw new ConflictException({
        code: "ALREADY_STORE_MEMBER",
        messageZh: "你已经是这家店的成员",
      });
    }

    const pending = await this.prisma.storeJoinRequest.findFirst({
      where: { storeId, userId: user.id, status: "PENDING" },
    });
    if (pending) return pending;

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
        return joinRequest;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.storeJoinRequest.findFirst({
          where: { storeId, userId: user.id, status: "PENDING" },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private isStoreCodeCollision(error: Prisma.PrismaClientKnownRequestError): boolean {
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.some((item) => String(item).includes("store_code"))
      : String(target ?? "").includes("store_code");
  }
}
