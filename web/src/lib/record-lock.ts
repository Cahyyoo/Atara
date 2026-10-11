import "server-only";

import { Prisma } from "@prisma/client";

/**
 * Locks lab records for the rest of a transaction and reads them again.
 *
 * A save decides what it would overwrite from a read taken before its
 * transaction. Two analysts filling the same empty result at once both read
 * it empty, both pass the "nothing would be replaced" check, and the second
 * silently replaced the first -- the very thing the overwrite guard exists to
 * stop. Re-reading under a row lock inside the write makes the check and the
 * write one step: the second save waits for the first, then sees its value.
 *
 * Locked in id order, so two saves over overlapping rows queue rather than
 * deadlock.
 */
export async function lockLabRecords<S extends Prisma.LabRecordSelect & { id: true }>(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
  select: S
): Promise<Map<string, Prisma.LabRecordGetPayload<{ select: S }>>> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map();
  for (let start = 0; start < unique.length; start += 1_000) {
    const chunk = unique.slice(start, start + 1_000);
    await tx.$queryRaw`SELECT id FROM lab_records WHERE id IN (${Prisma.join(chunk)}) ORDER BY id FOR UPDATE`;
  }
  const rows: Prisma.LabRecordGetPayload<{ select: S }>[] = [];
  for (let start = 0; start < unique.length; start += 1_000) {
    rows.push(
      ...((await tx.labRecord.findMany({
        where: { id: { in: unique.slice(start, start + 1_000) } },
        select,
      })) as Prisma.LabRecordGetPayload<{ select: S }>[])
    );
  }
  return new Map(rows.map((row) => [(row as { id: string }).id, row]));
}
