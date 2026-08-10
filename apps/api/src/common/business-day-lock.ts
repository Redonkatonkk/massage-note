import type { Prisma } from "@massage-note/database";

export async function lockBusinessDay(
  transaction: Prisma.TransactionClient,
  storeId: string,
  businessDate: string,
): Promise<void> {
  await transaction.$queryRaw`
    WITH acquired_lock AS (
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${storeId}:${businessDate}`}, 0)
      )
    )
    SELECT 1::int AS locked FROM acquired_lock
  `;
}
