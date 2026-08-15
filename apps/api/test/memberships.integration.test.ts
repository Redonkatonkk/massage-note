import { randomInt, randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/database/prisma.service.js";
import { MembershipsService } from "../src/stores/memberships.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { StoreManagementService } from "../src/stores/store-management.service.js";
import { StoresService } from "../src/stores/stores.service.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const memberships = new MembershipsService(prisma, access);
const idempotency = new IdempotencyService(prisma);
const storeManagement = new StoreManagementService(
  prisma,
  access,
  idempotency,
);
const stores = new StoresService(prisma);
const storeId = randomUUID();
const otherStoreId = randomUUID();
const ownerId = randomUUID();
const managerId = randomUUID();
const applicantId = randomUUID();
const claimantId = randomUUID();
const impostorId = randomUUID();
const outsiderId = randomUUID();
const ownerMembershipId = randomUUID();
const managerMembershipId = randomUUID();
const outsiderMembershipId = randomUUID();
const joinRequestId = randomUUID();
const actor = (id: string) => ({
  id,
  firstName: id === claimantId
    ? "待认领员工"
    : id === impostorId
      ? "其他名字"
      : null,
}) as User;

describe.skipIf(!enabled).sequential("成员审批与跨店隔离", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [ownerId, managerId, applicantId, claimantId, impostorId, outsiderId].map((id, index) => ({
        id,
        firebaseUid: `membership-test-${id}`,
        phoneE164: `+1646${(randomInt(10_000_000, 99_000_000) + index).toString()}`,
        firstName: id === claimantId
          ? "待认领员工"
          : id === impostorId
            ? "其他名字"
            : null,
      })),
    });
    const firstCode = randomInt(0, 500_000);
    await prisma.store.createMany({
      data: [
        {
          id: storeId,
          storeCode: firstCode.toString().padStart(6, "0"),
          name: "成员集成测试店",
          timezone: "America/New_York",
          businessCutoffLocal: "22:00",
          globalCommissionBps: 5_000,
          status: "ACTIVE",
        },
        {
          id: otherStoreId,
          storeCode: (firstCode + 500_000).toString().padStart(6, "0"),
          name: "另一家测试店",
          timezone: "America/New_York",
          businessCutoffLocal: "22:00",
          globalCommissionBps: 5_000,
          status: "ACTIVE",
        },
      ],
    });
    await prisma.storeMembership.createMany({
      data: [
        {
          id: ownerMembershipId,
          storeId,
          userId: ownerId,
          role: "OWNER",
          displayName: "店主",
          displayNameNormalized: "店主",
        },
        {
          id: managerMembershipId,
          storeId,
          userId: managerId,
          role: "MANAGER",
          displayName: "经理",
          displayNameNormalized: "经理",
        },
        {
          id: outsiderMembershipId,
          storeId: otherStoreId,
          userId: outsiderId,
          role: "OWNER",
          displayName: "外店店主",
          displayNameNormalized: "外店店主",
        },
      ],
    });
    await prisma.store.update({
      where: { id: storeId },
      data: { ownerMembershipId },
    });
    await prisma.store.update({
      where: { id: otherStoreId },
      data: { ownerMembershipId: outsiderMembershipId },
    });
    await prisma.storeJoinRequest.create({
      data: {
        id: joinRequestId,
        storeId,
        userId: applicantId,
        requestedDisplayName: "新员工",
      },
    });
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.auditLog.deleteMany({
        where: { storeId: { in: [storeId, otherStoreId] } },
      });
      await prisma.domainOutbox.deleteMany({
        where: { storeId: { in: [storeId, otherStoreId] } },
      });
      await prisma.storeJoinRequest.deleteMany({
        where: { storeId: { in: [storeId, otherStoreId] } },
      });
      await prisma.idempotencyRequest.deleteMany({
        where: { storeId: { in: [storeId, otherStoreId] } },
      });
      await prisma.store.updateMany({
        where: { id: { in: [storeId, otherStoreId] } },
        data: { ownerMembershipId: null },
      });
      await prisma.storeMembership.deleteMany({
        where: { storeId: { in: [storeId, otherStoreId] } },
      });
      await prisma.store.deleteMany({
        where: { id: { in: [storeId, otherStoreId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, managerId, applicantId, claimantId, impostorId, outsiderId] } },
      });
    }
    await prisma.$disconnect();
  });

  let approvedMembershipId = "";
  let approvedVersion = 0;

  it("店主可以审批申请并建立参与记工的员工关系", async () => {
    const result = await memberships.approveJoinRequest(
      actor(ownerId),
      storeId,
      joinRequestId,
      { version: 1, role: "EMPLOYEE", isServiceProvider: true },
      "approve-request",
    );
    approvedMembershipId = result.membership.id;
    approvedVersion = result.membership.version;

    expect(result.joinRequest.status).toBe("APPROVED");
    expect(result.membership).toMatchObject({
      role: "EMPLOYEE",
      displayName: "新员工",
      isServiceProvider: true,
      status: "ACTIVE",
    });
  });

  it("经理可管理本店，普通员工和外店店主均不可管理本店", async () => {
    await expect(
      memberships.listMembers(actor(managerId), storeId),
    ).resolves.toHaveLength(3);
    await expect(
      memberships.listMembers(actor(applicantId), storeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      memberships.listMembers(actor(outsiderId), storeId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("经理只填名字创建员工，同名账号加入时自动认领原成员关系", async () => {
    await expect(
      memberships.createEmployee(
        actor(applicantId),
        storeId,
        { name: "越权员工" },
        "forbidden-create-employee",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const unclaimed = await memberships.createEmployee(
      actor(managerId),
      storeId,
      { name: "待认领员工" },
      "create-unclaimed-employee",
    );
    expect(unclaimed).toMatchObject({
      userId: null,
      role: "EMPLOYEE",
      displayName: "待认领员工",
      isServiceProvider: true,
      status: "ACTIVE",
    });

    const result = await stores.requestToJoin(
      actor(claimantId),
      storeId,
      { displayName: "待认领员工" },
      "claim-employee-account",
    );
    expect(result.autoMatched).toBe(true);
    if (!result.autoMatched) throw new Error("同名员工账号没有自动关联");
    expect(result.membership).toMatchObject({
      id: unclaimed.id,
      userId: claimantId,
      displayName: "待认领员工",
      version: unclaimed.version + 1,
    });
    await expect(stores.listForUser(claimantId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: unclaimed.id }),
      ]),
    );
    await expect(
      prisma.storeJoinRequest.count({
        where: { storeId, userId: claimantId, status: "PENDING" },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          storeId,
          entityId: unclaimed.id,
          action: {
            in: ["membership.created_unclaimed", "membership.account_claimed"],
          },
        },
      }),
    ).resolves.toBe(2);
  });

  it("只按账号注册名字自动认领，不能靠填写别人的店内名冒领", async () => {
    const protectedMembership = await memberships.createEmployee(
      actor(managerId),
      storeId,
      { name: "目标员工" },
      "create-protected-employee",
    );

    const result = await stores.requestToJoin(
      actor(impostorId),
      storeId,
      { displayName: "目标员工" },
      "impostor-join-request",
    );
    expect(result.autoMatched).toBe(false);
    await expect(
      prisma.storeMembership.findUniqueOrThrow({
        where: { id: protectedMembership.id },
        select: { userId: true },
      }),
    ).resolves.toEqual({ userId: null });
    await expect(
      prisma.storeJoinRequest.count({
        where: { storeId, userId: impostorId, status: "PENDING" },
      }),
    ).resolves.toBe(1);
  });

  it("乐观锁阻止旧版本覆盖其他经理的修改", async () => {
    const updated = await memberships.updateMember(
      actor(managerId),
      storeId,
      approvedMembershipId,
      { version: approvedVersion, displayName: "新员工甲" },
      "update-request",
    );
    approvedVersion = updated.version;

    await expect(
      memberships.updateMember(
        actor(ownerId),
        storeId,
        approvedMembershipId,
        { version: approvedVersion - 1, isServiceProvider: false },
        "stale-request",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("停用和恢复仅改变当前成员关系并保留审计", async () => {
    const inactive = await memberships.deactivateMember(
      actor(managerId),
      storeId,
      approvedMembershipId,
      { version: approvedVersion, reason: "暂时离职" },
      "deactivate-request",
    );
    expect(inactive.status).toBe("INACTIVE");

    const restored = await memberships.restoreMember(
      actor(ownerId),
      storeId,
      approvedMembershipId,
      { version: inactive.version, displayName: "返店员工" },
      "restore-request",
    );
    expect(restored).toMatchObject({ status: "ACTIVE", displayName: "返店员工" });

    const auditCount = await prisma.auditLog.count({
      where: {
        storeId,
        entityId: approvedMembershipId,
        action: {
          in: [
            "membership.join_approved",
            "membership.updated",
            "membership.deactivated",
            "membership.restored",
          ],
        },
      },
    });
    expect(auditCount).toBe(4);
  });

  it("经理可修改店铺设置，但只有当前 Owner 可以原子转移店主", async () => {
    const updatedStore = await storeManagement.update(
      actor(managerId),
      storeId,
      {
        version: 1,
        businessCutoffLocal: "21:30",
        mondayThursdayAutoDiscountEnabled: true,
        mondayThursdayAutoDiscountThresholdCents: 10_000,
        mondayThursdayAutoDiscountAmountCents: 1_000,
      },
      "store-update-key-0001",
      "store-update",
    );
    expect(updatedStore).toMatchObject({
      businessCutoffLocal: "21:30",
      mondayThursdayAutoDiscountEnabled: true,
      mondayThursdayAutoDiscountThresholdCents: 10_000n,
      mondayThursdayAutoDiscountAmountCents: 1_000n,
      version: 2,
    });

    await expect(
      storeManagement.transferOwner(
        actor(managerId),
        storeId,
        { version: 2, newOwnerMembershipId: managerMembershipId },
        "manager-transfer-key-0001",
        "manager-transfer",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const transferred = await storeManagement.transferOwner(
      actor(ownerId),
      storeId,
      { version: 2, newOwnerMembershipId: managerMembershipId },
      "owner-transfer-key-0001",
      "owner-transfer",
    );
    expect(transferred.store).toMatchObject({
      ownerMembershipId: managerMembershipId,
      version: 3,
    });
    expect(transferred.previousOwner.role).toBe("MANAGER");
    expect(transferred.newOwner.role).toBe("OWNER");

    await expect(
      storeManagement.transferOwner(
        actor(ownerId),
        storeId,
        { version: 3, newOwnerMembershipId: ownerMembershipId },
        "former-owner-key-0001",
        "former-owner-transfer",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("软删除店铺后所有成员立即失去访问且切换列表不再显示", async () => {
    await expect(stores.listForUser(managerId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ store: expect.objectContaining({ id: storeId }) }),
      ]),
    );

    const deleted = await storeManagement.delete(
      actor(managerId),
      storeId,
      { version: 3, reason: "集成测试删除" },
      "delete-store-key-0001",
      "delete-store-request",
    );
    expect(deleted).toMatchObject({ status: "DELETED", version: 4 });
    await expect(stores.listForUser(managerId)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ store: expect.objectContaining({ id: storeId }) }),
      ]),
    );
    await expect(access.requireActiveMembership(managerId, storeId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
