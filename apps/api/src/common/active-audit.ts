import type { Prisma } from "@massage-note/database";

// History stays append-only, but undone commands no longer express scheduling
// intent. Compensation audits from the undo transaction remain active.
export async function activeAuditWhere(tx: Prisma.TransactionClient, storeId: string): Promise<Prisma.AuditLogWhereInput> {
  const undos = await tx.auditUndo.findMany({ where: { storeId }, select: { transactionId: true, auditLogId: true } });
  if (!undos.length) return {};
  return { AND: [
    { id: { notIn: undos.map(row => row.auditLogId) } },
    { OR: [{ undoTransaction: null }, { undoTransaction: { transactionId: { notIn: undos.map(row => row.transactionId) } } }] },
  ] };
}
