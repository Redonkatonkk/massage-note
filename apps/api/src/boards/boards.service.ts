import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type StoreMembership, type User } from "@massage-note/database";
import type {
  AddBoardRowInput,
  ClockOutInput,
  ReorderBoardInput,
  UpdateBoardRowInput,
} from "@massage-note/contracts";
import { businessDateFor, hasStoreCapability } from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);

interface BoardStatistics {
  recordCount: number;
  grossFeeBaseCents: bigint;
  discountTotalCents: bigint;
  discountedFeePerformanceCents: bigint;
  totalTipCents: bigint;
  totalLargeFeeWageCents: bigint;
  employeeIncomeCents: bigint;
  giftCardSaleCount: number;
  giftCardCashCents: bigint;
  giftCardCardCents: bigint;
  giftCardSalesAmountCents: bigint;
  storeIncomeCents: bigint;
}

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async currentBusinessDay(actor: User, storeId: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    const store = await this.findStore(this.prisma, storeId);
    const businessDate = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    return {
      businessDate,
      timezone: store.timezone,
      businessCutoffLocal: store.businessCutoffLocal,
      serverTime: new Date(),
    };
  }

  async getBoard(actor: User, storeId: string, businessDate: string) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const store = await this.findStore(this.prisma, storeId);
    const currentDate = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    const personalHistoryMembershipId =
      businessDate !== currentDate &&
      !hasStoreCapability(actorMembership.role, "FINANCE_READ_STORE")
        ? actorMembership.id
        : null;

    const board = await this.prisma.dailyBoard.findUnique({
      where: { storeId_businessDate: { storeId, businessDate: dateAtUtc(businessDate) } },
      include: {
        rows: {
          ...(personalHistoryMembershipId
            ? { where: { membershipId: personalHistoryMembershipId } }
            : {}),
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: {
            membership: {
              select: {
                id: true,
                displayName: true,
                role: true,
                isServiceProvider: true,
                status: true,
              },
            },
          },
        },
      },
    });
    const [records, shifts, giftCardSales, closing] = await Promise.all([
      this.prisma.workRecord.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          deletedAt: null,
          ...(personalHistoryMembershipId
            ? { employeeMembershipId: personalHistoryMembershipId }
            : {}),
        },
        orderBy: { startAt: "asc" },
        include: {
          serviceSnapshot: true,
          addonSnapshots: { orderBy: { position: "asc" } },
          discountSnapshots: { orderBy: { position: "asc" } },
          payment: true,
        },
      }),
      this.prisma.shift.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          ...(personalHistoryMembershipId
            ? { membershipId: personalHistoryMembershipId }
            : {}),
        },
        orderBy: { clockInAt: "asc" },
      }),
      personalHistoryMembershipId
        ? Promise.resolve([])
        : this.prisma.giftCardSale.findMany({
            where: {
              storeId,
              businessDate: dateAtUtc(businessDate),
              deletedAt: null,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: {
              operator: {
                select: { id: true, displayName: true, role: true, status: true },
              },
            },
          }),
      this.prisma.businessDayClosing.findFirst({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          status: "CLOSED",
        },
        orderBy: { cycleNo: "desc" },
      }),
    ]);

    const boardRows = personalHistoryMembershipId
      ? board?.rows ?? []
      : (board?.rows ?? []).filter(
          (row) =>
            !row.isHidden ||
            hasStoreCapability(actorMembership.role, "MEMBERSHIP_MANAGE"),
        );
    const rows = boardRows.map((row) => {
      const employeeRecords = records.filter(
        (record) => record.employeeMembershipId === row.membershipId,
      );
      const employeeShifts = shifts.filter(
        (shift) => shift.membershipId === row.membershipId,
      );
      return {
        ...row,
        shifts: employeeShifts,
        workRecords: employeeRecords,
        statistics: this.calculateRowStatistics(employeeRecords),
      };
    });
    const statistics = this.calculateRowStatistics(records);
    for (const sale of giftCardSales) {
      statistics.giftCardSaleCount += 1;
      statistics.giftCardCashCents += sale.cashCents;
      statistics.giftCardCardCents += sale.cardCents;
      statistics.giftCardSalesAmountCents += sale.amountCents;
      statistics.storeIncomeCents += sale.amountCents;
    }
    return {
      id: board?.id ?? null,
      storeId,
      businessDate,
      version: board?.version ?? 0,
      isClosed: Boolean(closing),
      closing: personalHistoryMembershipId ? null : closing,
      rows,
      giftCardSales,
      statistics,
    };
  }

  async clockIn(
    actor: User,
    storeId: string,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    if (!actorMembership.isServiceProvider) {
      throw new ConflictException({
        code: "SERVICE_PROVIDER_DISABLED",
        messageZh: "你当前未参与记工，不能上班打卡",
      });
    }
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route: "/api/v1/stores/:storeId/shifts/clock-in",
          payload: {},
          responseCode: 201,
        },
        async (transaction) => {
          const store = await this.findStore(transaction, storeId);
          const now = new Date();
          const businessDate = businessDateFor({
            startAt: now,
            timezone: store.timezone,
            cutoffLocal: store.businessCutoffLocal,
          });
          await this.assertDayOpen(transaction, storeId, businessDate);
          const membership = await transaction.storeMembership.findFirst({
            where: {
              id: actorMembership.id,
              storeId,
              status: "ACTIVE",
              deletedAt: null,
              isServiceProvider: true,
            },
          });
          if (!membership) {
            throw new ForbiddenException({
              code: "ACTIVE_MEMBERSHIP_REQUIRED",
              messageZh: "你不是这家店的在职记工成员",
            });
          }
          const openShift = await transaction.shift.findFirst({
            where: { storeId, membershipId: membership.id, clockOutAt: null },
          });
          if (openShift) {
            if (openShift.businessDate.getTime() === dateAtUtc(businessDate).getTime()) {
              throw new ConflictException({
                code: "SHIFT_ALREADY_OPEN",
                messageZh: "你已经上班并加入今日表格，请刷新页面",
                latestResource: openShift,
              });
            }
            const closed = await transaction.shift.updateMany({
              where: { id: openShift.id, clockOutAt: null, version: openShift.version },
              data: { clockOutAt: now, updatedBy: actor.id, version: { increment: 1 } },
            });
            if (closed.count !== 1) {
              throw new ConflictException({
                code: "SHIFT_VERSION_CONFLICT",
                messageZh: "旧营业日的上下班记录已发生变化，请重试",
              });
            }
            await transaction.auditLog.create({
              data: {
                storeId,
                actorUserId: actor.id,
                actorMembershipId: membership.id,
                source: "api",
                action: "shift.stale_auto_closed",
                entityType: "shift",
                entityId: openShift.id,
                businessDate: openShift.businessDate,
                beforeJson: { clockOutAt: null, version: openShift.version },
                afterJson: { clockOutAt: now.toISOString(), version: openShift.version + 1 },
                reason: "新营业日重新上班时自动结束遗留班次",
                requestId,
              },
            });
          }
          const shift = await transaction.shift.create({
            data: {
              storeId,
              membershipId: membership.id,
              businessDate: dateAtUtc(businessDate),
              clockInAt: now,
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          });
          const { board, row } = await this.ensureBoardRow(
            transaction,
            storeId,
            businessDate,
            membership.id,
            actor.id,
          );
          await transaction.auditLog.create({
            data: {
              storeId,
              actorUserId: actor.id,
              actorMembershipId: membership.id,
              source: "api",
              action: "shift.clocked_in",
              entityType: "shift",
              entityId: shift.id,
              businessDate: shift.businessDate,
              afterJson: {
                membershipId: membership.id,
                clockInAt: shift.clockInAt.toISOString(),
                businessDate,
              },
              requestId,
            },
          });
          return { shift, board, row };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "SHIFT_ALREADY_OPEN",
          messageZh: "你已经上班并加入今日表格，请刷新页面",
        });
      }
      throw error;
    }
  }

  async clockOut(
    actor: User,
    storeId: string,
    shiftId: string,
    input: ClockOutInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/shifts/:shiftId/clock-out",
        payload: { shiftId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.shift.findFirst({
          where: { id: shiftId, storeId, membershipId: actorMembership.id },
        });
        if (!current) {
          throw new NotFoundException({
            code: "SHIFT_NOT_FOUND",
            messageZh: "没有找到你的这条上班记录",
          });
        }
        await this.assertDayOpen(
          transaction,
          storeId,
          current.businessDate.toISOString().slice(0, 10),
        );
        const changed = await transaction.shift.updateMany({
          where: {
            id: shiftId,
            storeId,
            membershipId: actorMembership.id,
            clockOutAt: null,
            version: input.version,
          },
          data: {
            clockOutAt: new Date(),
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          const latest = await transaction.shift.findUnique({
            where: { id: shiftId },
          });
          throw new ConflictException({
            code: "SHIFT_VERSION_CONFLICT",
            messageZh: "上下班记录已发生变化，请刷新后重试",
            latestResource: latest,
          });
        }
        const shift = await transaction.shift.findUniqueOrThrow({
          where: { id: shiftId },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "shift.clocked_out",
            entityType: "shift",
            entityId: shift.id,
            businessDate: shift.businessDate,
            beforeJson: { clockOutAt: null, version: current.version },
            afterJson: {
              clockOutAt: shift.clockOutAt?.toISOString() ?? null,
              version: shift.version,
            },
            requestId,
          },
        });
        return shift;
      },
    );
  }

  async addRow(
    actor: User,
    storeId: string,
    businessDate: string,
    input: AddBoardRowInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/rows",
        payload: { businessDate, input },
        responseCode: 201,
      },
      async (transaction) => {
        await this.assertDayOpen(transaction, storeId, businessDate);
        const member = await transaction.storeMembership.findFirst({
          where: {
            id: input.membershipId,
            storeId,
            status: "ACTIVE",
            deletedAt: null,
            isServiceProvider: true,
          },
        });
        if (!member) {
          throw new NotFoundException({
            code: "SERVICE_PROVIDER_NOT_FOUND",
            messageZh: "没有找到该店的在职服务人员",
          });
        }
        const result = await this.ensureBoardRow(
          transaction,
          storeId,
          businessDate,
          member.id,
          actor.id,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "board.row_added",
            entityType: "daily_employee_row",
            entityId: result.row.id,
            businessDate: dateAtUtc(businessDate),
            afterJson: {
              membershipId: member.id,
              displayName: member.displayName,
              boardVersion: result.board.version,
            },
            requestId,
          },
        });
        return result;
      },
    );
  }

  async updateRow(
    actor: User,
    storeId: string,
    businessDate: string,
    rowId: string,
    input: UpdateBoardRowInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/rows/:rowId",
        payload: { businessDate, rowId, input },
        responseCode: 200,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const row = await transaction.dailyEmployeeRow.findFirst({
          where: {
            id: rowId,
            storeId,
            board: { businessDate: dateAtUtc(businessDate) },
          },
        });
        if (!row) this.throwRowNotFound();
        const changed = await transaction.dailyEmployeeRow.updateMany({
          where: { id: rowId, storeId, version: input.version },
          data: { isHidden: input.isHidden, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          await this.throwRowConflict(transaction, rowId, storeId);
        }
        const updated = await transaction.dailyEmployeeRow.findUniqueOrThrow({
          where: { id: rowId },
        });
        const board = await transaction.dailyBoard.update({
          where: { id: row.boardId },
          data: { version: { increment: 1 } },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: input.isHidden ? "board.row_hidden" : "board.row_shown",
            entityType: "daily_employee_row",
            entityId: rowId,
            businessDate: dateAtUtc(businessDate),
            beforeJson: { isHidden: row.isHidden, version: row.version },
            afterJson: {
              isHidden: updated.isHidden,
              version: updated.version,
              boardVersion: board.version,
            },
            requestId,
          },
        });
        return { row: updated, board };
      },
    );
  }

  async reorder(
    actor: User,
    storeId: string,
    businessDate: string,
    input: ReorderBoardInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/reorder",
        payload: { businessDate, input },
        responseCode: 200,
      },
      async (transaction) => {
        await this.assertDayOpen(transaction, storeId, businessDate);
        const board = await transaction.dailyBoard.findUnique({
          where: {
            storeId_businessDate: {
              storeId,
              businessDate: dateAtUtc(businessDate),
            },
          },
          include: { rows: { select: { id: true } } },
        });
        if (!board) {
          throw new NotFoundException({
            code: "BOARD_NOT_FOUND",
            messageZh: "该营业日还没有员工表格",
          });
        }
        const actualIds = board.rows.map((row) => row.id).sort();
        const requestedIds = [...input.rowIds].sort();
        if (
          new Set(input.rowIds).size !== input.rowIds.length ||
          actualIds.length !== requestedIds.length ||
          actualIds.some((id, index) => id !== requestedIds[index])
        ) {
          throw new BadRequestException({
            code: "BOARD_ROWS_MISMATCH",
            messageZh: "排序列表必须完整包含当前表格的全部员工行",
          });
        }
        const changed = await transaction.dailyBoard.updateMany({
          where: { id: board.id, version: input.version },
          data: { version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          const latest = await transaction.dailyBoard.findUnique({
            where: { id: board.id },
          });
          throw new ConflictException({
            code: "BOARD_VERSION_CONFLICT",
            messageZh: "员工顺序已被其他设备修改，请刷新后重试",
            latestResource: latest,
          });
        }
        for (const [position, rowId] of input.rowIds.entries()) {
          await transaction.dailyEmployeeRow.update({
            where: { id: rowId },
            data: {
              position: new Prisma.Decimal(position + 1),
              version: { increment: 1 },
            },
          });
        }
        const updated = await transaction.dailyBoard.findUniqueOrThrow({
          where: { id: board.id },
          include: {
            rows: { orderBy: { position: "asc" } },
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "board.rows_reordered",
            entityType: "daily_board",
            entityId: board.id,
            businessDate: dateAtUtc(businessDate),
            beforeJson: { rowIds: board.rows.map((row) => row.id), version: board.version },
            afterJson: { rowIds: input.rowIds, version: updated.version },
            requestId,
          },
        });
        return updated;
      },
    );
  }

  private async ensureBoardRow(
    transaction: Prisma.TransactionClient,
    storeId: string,
    businessDate: string,
    membershipId: string,
    actorUserId: string,
  ) {
    const board = await transaction.dailyBoard.upsert({
      where: {
        storeId_businessDate: { storeId, businessDate: dateAtUtc(businessDate) },
      },
      create: { storeId, businessDate: dateAtUtc(businessDate) },
      update: {},
    });
    await transaction.$queryRaw`
      SELECT id FROM daily_boards WHERE id = ${board.id}::uuid FOR UPDATE
    `;
    const existing = await transaction.dailyEmployeeRow.findUnique({
      where: { boardId_membershipId: { boardId: board.id, membershipId } },
    });
    if (existing) {
      return { board, row: existing };
    }
    const maximum = await transaction.dailyEmployeeRow.aggregate({
      where: { boardId: board.id },
      _max: { position: true },
    });
    const position = maximum._max.position
      ? maximum._max.position.plus(1)
      : new Prisma.Decimal(1);
    const row = await transaction.dailyEmployeeRow.create({
      data: {
        boardId: board.id,
        storeId,
        membershipId,
        position,
        addedBy: actorUserId,
      },
    });
    const updatedBoard = await transaction.dailyBoard.update({
      where: { id: board.id },
      data: { version: { increment: 1 } },
    });
    return { board: updatedBoard, row };
  }

  private calculateRowStatistics(
    records: Array<{
      grossFeeBaseCents: bigint;
      discountTotalCents: bigint;
      discountedFeePerformanceCents: bigint;
      totalTipCents: bigint | null;
      totalLargeFeeWageCents: bigint;
    }>,
  ) {
    return records.reduce<BoardStatistics>(
      (total, record) => {
        const totalTipCents = record.totalTipCents ?? 0n;
        const employeeIncomeCents =
          record.totalLargeFeeWageCents + totalTipCents;
        return {
          recordCount: total.recordCount + 1,
          grossFeeBaseCents:
            total.grossFeeBaseCents + record.grossFeeBaseCents,
          discountTotalCents:
            total.discountTotalCents + record.discountTotalCents,
          discountedFeePerformanceCents:
            total.discountedFeePerformanceCents +
            record.discountedFeePerformanceCents,
          totalTipCents: total.totalTipCents + totalTipCents,
          totalLargeFeeWageCents:
            total.totalLargeFeeWageCents + record.totalLargeFeeWageCents,
          employeeIncomeCents:
            total.employeeIncomeCents + employeeIncomeCents,
          giftCardSaleCount: total.giftCardSaleCount,
          giftCardCashCents: total.giftCardCashCents,
          giftCardCardCents: total.giftCardCardCents,
          giftCardSalesAmountCents: total.giftCardSalesAmountCents,
          storeIncomeCents:
            total.storeIncomeCents +
            record.grossFeeBaseCents -
            record.discountTotalCents +
            totalTipCents -
            employeeIncomeCents,
        };
      },
      {
        recordCount: 0,
        grossFeeBaseCents: 0n,
        discountTotalCents: 0n,
        discountedFeePerformanceCents: 0n,
        totalTipCents: 0n,
        totalLargeFeeWageCents: 0n,
        employeeIncomeCents: 0n,
        giftCardSaleCount: 0,
        giftCardCashCents: 0n,
        giftCardCardCents: 0n,
        giftCardSalesAmountCents: 0n,
        storeIncomeCents: 0n,
      },
    );
  }

  private async findStore(
    client: Pick<PrismaService, "store"> | Prisma.TransactionClient,
    storeId: string,
  ) {
    const store = await client.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        timezone: true,
        businessCutoffLocal: true,
      },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        messageZh: "店铺不存在或已停用",
      });
    }
    return store;
  }

  private async assertDayOpen(
    transaction: Prisma.TransactionClient,
    storeId: string,
    businessDate: string,
  ) {
    await lockBusinessDay(transaction, storeId, businessDate);
    const closing = await transaction.businessDayClosing.findFirst({
      where: {
        storeId,
        businessDate: dateAtUtc(businessDate),
        status: "CLOSED",
      },
      select: { id: true },
    });
    if (closing) {
      throw new ConflictException({
        code: "BUSINESS_DAY_CLOSED",
        messageZh: "该营业日已经日结，请先取消日结再修改表格",
      });
    }
  }

  private async throwRowConflict(
    transaction: Prisma.TransactionClient,
    rowId: string,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.dailyEmployeeRow.findFirst({
      where: { id: rowId, storeId },
    });
    if (!latest) this.throwRowNotFound();
    throw new ConflictException({
      code: "BOARD_ROW_VERSION_CONFLICT",
      messageZh: "员工行已被其他设备修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwRowNotFound(): never {
    throw new NotFoundException({
      code: "BOARD_ROW_NOT_FOUND",
      messageZh: "没有找到该员工行",
    });
  }
}
