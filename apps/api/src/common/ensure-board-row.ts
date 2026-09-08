import { Prisma } from "@massage-note/database";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);

// Call only while holding the store/business-day advisory lock.
export async function ensureBoardRow(
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
