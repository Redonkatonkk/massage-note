import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  type StoreMembership,
  type User,
} from "@massage-note/database";
import type {
  ApproveJoinRequest,
  CreateEmployeeInput,
  DeactivateMembershipInput,
  RejectJoinRequestInput,
  RestoreMembershipInput,
  UpdateMembershipInput,
} from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { normalizeDisplayName } from "./display-name.js";
import { StoreAccessService } from "./store-access.service.js";

function membershipSnapshot(membership: StoreMembership) {
  return {
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    displayName: membership.displayName,
    isServiceProvider: membership.isServiceProvider,
    employmentType: membership.employmentType,
    defaultCommissionBps: membership.defaultCommissionBps,
    closingDeliveryEnabled: membership.closingDeliveryEnabled,
    closingDeliveryPhoneE164: membership.closingDeliveryPhoneE164,
    closingImageLocale: membership.closingImageLocale,
    status: membership.status,
    version: membership.version,
  };
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async listJoinRequests(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.prisma.storeJoinRequest.findMany({
      where: { storeId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, phoneE164: true },
        },
      },
    });
  }

  async listMembers(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.prisma.storeMembership.findMany({
      where: { storeId },
      orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, phoneE164: true },
        },
      },
    });
  }

  async createEmployee(
    actor: User,
    storeId: string,
    input: CreateEmployeeInput,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.assertDailyRankingEmploymentType(transaction, storeId, {
          isActive: true,
          isServiceProvider: true,
          employmentType: input.employmentType ?? null,
        });
        const membership = await transaction.storeMembership.create({
          data: {
            storeId,
            userId: null,
            role: "EMPLOYEE",
            displayName: input.name,
            displayNameNormalized: normalizeDisplayName(input.name),
            isServiceProvider: true,
            ...(input.employmentType === undefined ? {} : { employmentType: input.employmentType }),
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "membership.created_unclaimed",
            entityType: "store_membership",
            entityId: membership.id,
            afterJson: membershipSnapshot(membership),
            requestId,
          },
        });
        return membership;
      });
    } catch (error) {
      this.rethrowDisplayNameConflict(error);
    }
  }

  async approveJoinRequest(
    actor: User,
    storeId: string,
    joinRequestId: string,
    input: ApproveJoinRequest,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const joinRequest = await transaction.storeJoinRequest.findFirst({
          where: { id: joinRequestId, storeId },
        });
        if (!joinRequest) this.throwJoinRequestNotFound();

        const reviewed = await transaction.storeJoinRequest.updateMany({
          where: {
            id: joinRequestId,
            storeId,
            status: "PENDING",
            version: input.version,
          },
          data: {
            status: "APPROVED",
            reviewedBy: actorMembership.id,
            reviewedAt: new Date(),
            reviewNote: null,
            version: { increment: 1 },
          },
        });
        if (reviewed.count !== 1) {
          await this.throwJoinRequestConflict(transaction, joinRequestId, storeId);
        }

        const existing = await transaction.storeMembership.findUnique({
          where: {
            storeId_userId: { storeId, userId: joinRequest.userId },
          },
        });
        if (existing?.role === "OWNER") this.throwOwnerTransferRequired();
        const normalizedName = normalizeDisplayName(
          joinRequest.requestedDisplayName,
        );
        await this.assertDailyRankingEmploymentType(transaction, storeId, {
          isActive: true,
          isServiceProvider: input.isServiceProvider,
          employmentType:
            input.employmentType ?? existing?.employmentType ?? null,
        });
        const membership = existing
          ? await transaction.storeMembership.update({
              where: { id: existing.id },
              data: {
                role: input.role,
                displayName: joinRequest.requestedDisplayName,
                displayNameNormalized: normalizedName,
                isServiceProvider: input.isServiceProvider,
                ...(input.employmentType === undefined ? {} : { employmentType: input.employmentType }),
                status: "ACTIVE",
                joinedAt: new Date(),
                leftAt: null,
                deletedAt: null,
                deletedBy: null,
                deleteReason: null,
                version: { increment: 1 },
              },
            })
          : await transaction.storeMembership.create({
              data: {
                storeId,
                userId: joinRequest.userId,
                role: input.role,
                displayName: joinRequest.requestedDisplayName,
                displayNameNormalized: normalizedName,
                isServiceProvider: input.isServiceProvider,
                ...(input.employmentType === undefined ? {} : { employmentType: input.employmentType }),
              },
            });

        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: existing
              ? "membership.join_approved_and_restored"
              : "membership.join_approved",
            entityType: "store_membership",
            entityId: membership.id,
            ...(existing
              ? { beforeJson: membershipSnapshot(existing) }
              : {}),
            afterJson: membershipSnapshot(membership),
            requestId,
          },
        });

        const updatedRequest = await transaction.storeJoinRequest.findUniqueOrThrow({
          where: { id: joinRequestId },
        });
        return { joinRequest: updatedRequest, membership };
      });
    } catch (error) {
      this.rethrowDisplayNameConflict(error);
    }
  }

  async rejectJoinRequest(
    actor: User,
    storeId: string,
    joinRequestId: string,
    input: RejectJoinRequestInput,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.prisma.$transaction(async (transaction) => {
      const exists = await transaction.storeJoinRequest.findFirst({
        where: { id: joinRequestId, storeId },
        select: { id: true },
      });
      if (!exists) this.throwJoinRequestNotFound();

      const changed = await transaction.storeJoinRequest.updateMany({
        where: {
          id: joinRequestId,
          storeId,
          status: "PENDING",
          version: input.version,
        },
        data: {
          status: "REJECTED",
          reviewedBy: actorMembership.id,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote ?? null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        await this.throwJoinRequestConflict(transaction, joinRequestId, storeId);
      }

      const rejected = await transaction.storeJoinRequest.findUniqueOrThrow({
        where: { id: joinRequestId },
      });
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId: actor.id,
          actorMembershipId: actorMembership.id,
          source: "api",
          action: "membership.join_rejected",
          entityType: "store_join_request",
          entityId: rejected.id,
          afterJson: {
            status: rejected.status,
            reviewNote: rejected.reviewNote,
            version: rejected.version,
          },
          requestId,
        },
      });
      return rejected;
    });
  }

  async updateMember(
    actor: User,
    storeId: string,
    membershipId: string,
    input: UpdateMembershipInput,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await this.findMemberOrThrow(
          transaction,
          storeId,
          membershipId,
        );
        if (current.role === "OWNER" && input.role !== undefined) {
          this.throwOwnerTransferRequired();
        }
        const closingDeliveryEnabled =
          input.closingDeliveryEnabled ?? current.closingDeliveryEnabled;
        const closingDeliveryPhoneE164 =
          input.closingDeliveryPhoneE164 === undefined
            ? current.closingDeliveryPhoneE164
            : input.closingDeliveryPhoneE164;
        if (closingDeliveryEnabled && !closingDeliveryPhoneE164) {
          const linkedUser = current.userId
            ? await transaction.user.findUnique({
                where: { id: current.userId },
                select: { phoneE164: true },
              })
            : null;
          if (!linkedUser?.phoneE164) {
            throw new ConflictException({
              code: "CLOSING_DELIVERY_PHONE_REQUIRED",
              messageZh:
                "此成员没有注册手机号，请先填写短信接收号码，再开启接收个人日结短信",
            });
          }
        }
        await this.assertDailyRankingEmploymentType(transaction, storeId, {
          isActive: current.status === "ACTIVE" && current.deletedAt === null,
          isServiceProvider:
            input.isServiceProvider ?? current.isServiceProvider,
          employmentType:
            input.employmentType === undefined
              ? current.employmentType
              : input.employmentType,
        });

        const changed = await transaction.storeMembership.updateMany({
          where: { id: membershipId, storeId, version: input.version },
          data: {
            ...(input.displayName === undefined
              ? {}
              : {
                  displayName: input.displayName,
                  displayNameNormalized: normalizeDisplayName(input.displayName),
                }),
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.isServiceProvider === undefined
              ? {}
              : { isServiceProvider: input.isServiceProvider }),
            ...(input.employmentType === undefined
              ? {}
              : { employmentType: input.employmentType }),
            ...(input.defaultCommissionBps === undefined
              ? {}
              : { defaultCommissionBps: input.defaultCommissionBps }),
            ...(input.closingDeliveryEnabled === undefined
              ? {}
              : { closingDeliveryEnabled: input.closingDeliveryEnabled }),
            ...(input.closingDeliveryPhoneE164 === undefined
              ? {}
              : { closingDeliveryPhoneE164: input.closingDeliveryPhoneE164 }),
            ...(input.closingImageLocale === undefined
              ? {}
              : { closingImageLocale: input.closingImageLocale }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwMembershipConflict(transaction, membershipId, storeId);
        }
        const updated = await this.findMemberOrThrow(
          transaction,
          storeId,
          membershipId,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "membership.updated",
            entityType: "store_membership",
            entityId: membershipId,
            beforeJson: membershipSnapshot(current),
            afterJson: membershipSnapshot(updated),
            requestId,
          },
        });
        return updated;
      });
    } catch (error) {
      this.rethrowDisplayNameConflict(error);
    }
  }

  async deactivateMember(
    actor: User,
    storeId: string,
    membershipId: string,
    input: DeactivateMembershipInput,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.prisma.$transaction(async (transaction) => {
      const current = await this.findMemberOrThrow(
        transaction,
        storeId,
        membershipId,
      );
      if (current.role === "OWNER") this.throwOwnerTransferRequired();
      if (current.status !== "ACTIVE" || current.deletedAt !== null) {
        throw new ConflictException({
          code: "MEMBERSHIP_NOT_ACTIVE",
          messageZh: "该成员已经不在职",
          latestResource: current,
        });
      }

      const changed = await transaction.storeMembership.updateMany({
        where: {
          id: membershipId,
          storeId,
          status: "ACTIVE",
          deletedAt: null,
          version: input.version,
        },
        data: {
          status: "INACTIVE",
          leftAt: new Date(),
          deletedBy: actor.id,
          deleteReason: input.reason,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        await this.throwMembershipConflict(transaction, membershipId, storeId);
      }
      const updated = await this.findMemberOrThrow(
        transaction,
        storeId,
        membershipId,
      );
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId: actor.id,
          actorMembershipId: actorMembership.id,
          source: "api",
          action: "membership.deactivated",
          entityType: "store_membership",
          entityId: membershipId,
          beforeJson: membershipSnapshot(current),
          afterJson: membershipSnapshot(updated),
          reason: input.reason,
          requestId,
        },
      });
      return updated;
    });
  }

  async restoreMember(
    actor: User,
    storeId: string,
    membershipId: string,
    input: RestoreMembershipInput,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await this.findMemberOrThrow(
          transaction,
          storeId,
          membershipId,
        );
        if (current.role === "OWNER") this.throwOwnerTransferRequired();
        if (current.status === "ACTIVE" && current.deletedAt === null) {
          throw new ConflictException({
            code: "MEMBERSHIP_ALREADY_ACTIVE",
            messageZh: "该成员已经在职",
            latestResource: current,
          });
        }

        const displayName = input.displayName ?? current.displayName;
        await this.assertDailyRankingEmploymentType(transaction, storeId, {
          isActive: true,
          isServiceProvider:
            input.isServiceProvider ?? current.isServiceProvider,
          employmentType:
            input.employmentType === undefined
              ? current.employmentType
              : input.employmentType,
        });
        const changed = await transaction.storeMembership.updateMany({
          where: { id: membershipId, storeId, version: input.version },
          data: {
            status: "ACTIVE",
            role: input.role ?? current.role,
            displayName,
            displayNameNormalized: normalizeDisplayName(displayName),
            isServiceProvider:
              input.isServiceProvider ?? current.isServiceProvider,
            employmentType:
              input.employmentType === undefined
                ? current.employmentType
                : input.employmentType,
            joinedAt: new Date(),
            leftAt: null,
            deletedAt: null,
            deletedBy: null,
            deleteReason: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwMembershipConflict(transaction, membershipId, storeId);
        }
        const updated = await this.findMemberOrThrow(
          transaction,
          storeId,
          membershipId,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "membership.restored",
            entityType: "store_membership",
            entityId: membershipId,
            beforeJson: membershipSnapshot(current),
            afterJson: membershipSnapshot(updated),
            requestId,
          },
        });
        return updated;
      });
    } catch (error) {
      this.rethrowDisplayNameConflict(error);
    }
  }

  private async assertDailyRankingEmploymentType(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membership: {
      isActive: boolean;
      isServiceProvider: boolean;
      employmentType: "FULL_TIME" | "PART_TIME" | null;
    },
  ) {
    await transaction.$queryRaw`
      SELECT id FROM stores WHERE id = ${storeId}::uuid FOR UPDATE
    `;
    if (
      !membership.isActive ||
      !membership.isServiceProvider ||
      membership.employmentType
    ) return;
    const store = await transaction.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: { automaticDispatchEnabled: true },
    });
    if (store?.automaticDispatchEnabled) {
      throw new ConflictException({
        code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED",
        messageZh: "每日开门排位已开启，参与记工的在职成员必须设置全职或兼职",
      });
    }
  }

  private async findMemberOrThrow(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
  ): Promise<StoreMembership> {
    const membership = await transaction.storeMembership.findFirst({
      where: { id: membershipId, storeId },
    });
    if (!membership) {
      throw new NotFoundException({
        code: "MEMBERSHIP_NOT_FOUND",
        messageZh: "没有找到该店铺成员",
      });
    }
    return membership;
  }

  private async throwMembershipConflict(
    transaction: Prisma.TransactionClient,
    membershipId: string,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.storeMembership.findFirst({
      where: { id: membershipId, storeId },
    });
    if (!latest) {
      throw new NotFoundException({
        code: "MEMBERSHIP_NOT_FOUND",
        messageZh: "没有找到该店铺成员",
      });
    }
    throw new ConflictException({
      code: "MEMBERSHIP_VERSION_CONFLICT",
      messageZh: "成员资料已被其他人修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private async throwJoinRequestConflict(
    transaction: Prisma.TransactionClient,
    joinRequestId: string,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.storeJoinRequest.findFirst({
      where: { id: joinRequestId, storeId },
    });
    if (!latest) this.throwJoinRequestNotFound();
    throw new ConflictException({
      code: "JOIN_REQUEST_VERSION_CONFLICT",
      messageZh: "该加入申请已被其他人处理，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwJoinRequestNotFound(): never {
    throw new NotFoundException({
      code: "JOIN_REQUEST_NOT_FOUND",
      messageZh: "没有找到该加入申请",
    });
  }

  private throwOwnerTransferRequired(): never {
    throw new ConflictException({
      code: "OWNER_TRANSFER_REQUIRED",
      messageZh: "拥有者只能通过店主转移流程变更或离职",
    });
  }

  private rethrowDisplayNameConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException({
        code: "DISPLAY_NAME_ALREADY_USED",
        messageZh: "该店内显示名称已被在职成员使用",
      });
    }
    throw error;
  }
}
