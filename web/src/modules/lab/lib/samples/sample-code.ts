import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";

/** Accepts a transaction client so callers can allocate codes inside their own transaction. */
type Db = Prisma.TransactionClient | typeof prisma;

const PREFIX = "SMPL";

/**
 * Prefixes this app used to issue, still read when deciding the next number.
 *
 * The codes are printed on labels that are already stuck to containers out in
 * the field, so renaming them was never on the table. What matters is that the
 * numbering does not restart: consulting only "SMPL" would hand out 00001 again
 * while NKL-2026-00001 is on a bucket somewhere, and "sample 1" would stop
 * naming one thing.
 */
const LEGACY_PREFIXES = ["NKL"] as const;

/** The single-code case, kept because the seed scripts and tests use it. */
export async function generateSampleCode(
  year: number = new Date().getFullYear(),
  db: Db = prisma
): Promise<string> {
  return (await generateSampleCodes(1, year, db))[0];
}

/** The highest sequence issued under one prefix this year, or 0 if none. */
async function lastSequenceFor(prefix: string, year: number, db: Db): Promise<number> {
  const head = `${prefix}-${year}-`;

  // Compared as numbers, not as text. The padding is five digits, and the
  // 100,000th code of a year is six: as text "SMPL-2026-100000" sorts below
  // "SMPL-2026-99999", so ordering by the code kept answering 99999, every
  // later generation tried to issue 100000 again, and barcode generation was
  // stuck for the rest of the year.
  const rows = await db.$queryRaw<{ last: bigint | number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(sample_code, ${head.length + 1}) AS UNSIGNED)) AS last
      FROM samples
     WHERE sample_code LIKE ${`${head}%`}`;
  const last = Number(rows[0]?.last ?? 0);
  return Number.isFinite(last) ? last : 0;
}

export async function generateSampleCodes(
  count: number,
  year: number = new Date().getFullYear(),
  db: Db = prisma
): Promise<string[]> {
  const sequences = await Promise.all(
    [PREFIX, ...LEGACY_PREFIXES].map((prefix) => lastSequenceFor(prefix, year, db))
  );
  const nextSequence = Math.max(...sequences) + 1;

  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(`${PREFIX}-${year}-${String(nextSequence + i).padStart(5, "0")}`);
  }
  return codes;
}
