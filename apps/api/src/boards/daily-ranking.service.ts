import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type { RankBoardInput } from "@massage-note/contracts";
import { businessDateFor, rankRotationCandidates } from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);

@Injectable()
export class DailyRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async rank(
    actor: User,
    storeId: string,
    businessDate: string,
    input: RankBoardInput,
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
        route: "/api/v1/stores/:storeId/boards/:date/rank",
        payload: { businessDate, input },
        responseCode: 200,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const store = await transaction.store.findFirst({
          where: { id: storeId, status: "ACTIVE", deletedAt: null },
          select: {
            timezone: true,
            businessCutoffLocal: true,
            automaticDispatchEnabled: true,
          },
        });
        if (!store) {
          throw new NotFoundException({
            code: "STORE_NOT_FOUND",
            messageZh: "没有找到店铺",
          });
        }
        if (!store.automaticDispatchEnabled) {
          throw new ConflictException({
            code: "DAILY_RANKING_DISABLED",
            messageZh: "请先在店铺设置中开启每日开门排位",
          });
        }
        const currentBusinessDate = businessDateFor({
          startAt: new Date(),
          timezone: store.timezone,
          cutoffLocal: store.businessCutoffLocal,
        });
        if (businessDate !== currentBusinessDate) {
          throw new ConflictException({
            code: "DAILY_RANKING_CURRENT_DAY_ONLY",
            messageZh: "只能生成当前营业日的员工顺序",
          });
        }
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
            messageZh: "该营业日已经日结，不能重新排位",
          });
        }

        const board = await transaction.dailyBoard.findUnique({
          where: {
            storeId_businessDate: {
              storeId,
              businessDate: dateAtUtc(businessDate),
            },
          },
          include: {
            rows: {
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              include: {
                membership: {
                  select: { displayName: true, employmentType: true },
                },
              },
            },
          },
        });
        if (!board) {
          throw new NotFoundException({
            code: "BOARD_NOT_FOUND",
            messageZh: "请先添加今天上班的员工",
          });
        }
        if (board.version !== input.version) {
          throw new ConflictException({
            code: "BOARD_VERSION_CONFLICT",
            messageZh: "员工顺序已经变化，请刷新后重试",
            latestResource: { version: board.version },
          });
        }

        const activeRows = board.rows.filter((row) => !row.isHidden);
        if (activeRows.length === 0) {
          throw new ConflictException({
            code: "DAILY_RANKING_BOARD_EMPTY",
            messageZh: "请先添加今天上班的员工",
          });
        }
        const missingTypes = activeRows.filter(
          (row) => !row.membership.employmentType,
        );
        if (missingTypes.length > 0) {
          throw new ConflictException({
            code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED",
            messageZh: `请先设置全职或兼职：${missingTypes
              .map((row) => row.membership.displayName)
              .join("、")}`,
          });
        }

        const histories = await Promise.all(
          activeRows.map(async (row) => {
            const previous = await transaction.dailyEmployeeRow.findFirst({
              where: {
                membershipId: row.membershipId,
                storeId,
                isHidden: false,
                board: {
                  businessDate: { lt: dateAtUtc(businessDate) },
                },
              },
              orderBy: [{ board: { businessDate: "desc" } }],
              select: {
                board: {
                  select: {
                    businessDate: true,
                    rows: {
                      where: { isHidden: false },
                      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                      select: { membershipId: true },
                    },
                  },
                },
              },
            });
            const visiblePosition = previous
              ? previous.board.rows.findIndex(
                  (candidate) => candidate.membershipId === row.membershipId,
                ) + 1
              : null;
            return {
              membershipId: row.membershipId,
              employmentType: row.membership.employmentType!,
              lastPosition: visiblePosition,
              lastBusinessDate:
                previous?.board.businessDate.toISOString().slice(0, 10) ?? null,
              addedAt: row.createdAt.toISOString(),
            };
          }),
        );
        const visibleOrder = rankRotationCandidates(histories);
        const hiddenOrder = board.rows
          .filter((row) => row.isHidden)
          .map((row) => row.membershipId);
        const completeOrder = [...visibleOrder, ...hiddenOrder];
        const beforeOrder = board.rows.map((row) => row.membershipId);
        const rankedAt = new Date();

        const changed = await transaction.dailyBoard.updateMany({
          where: { id: board.id, version: input.version },
          data: { rankedAt, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          throw new ConflictException({
            code: "BOARD_VERSION_CONFLICT",
            messageZh: "员工顺序已经变化，请刷新后重试",
          });
        }
        for (const [index, membershipId] of completeOrder.entries()) {
          const row = board.rows.find(
            (candidate) => candidate.membershipId === membershipId,
          )!;
          await transaction.dailyEmployeeRow.update({
            where: { id: row.id },
            data: {
              position: new Prisma.Decimal(index + 1),
              version: { increment: 1 },
            },
          });
        }

        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "board.rows_ranked",
            entityType: "daily_board",
            entityId: board.id,
            businessDate: dateAtUtc(businessDate),
            beforeJson: {
              membershipIds: beforeOrder,
              version: board.version,
            },
            afterJson: {
              membershipIds: completeOrder,
              visibleMembershipIds: visibleOrder,
              version: board.version + 1,
            },
            requestId,
          },
        });

        return transaction.dailyBoard.findUniqueOrThrow({
          where: { id: board.id },
          include: { rows: { orderBy: { position: "asc" } } },
        });
      },
    );
  }
}
