import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

  // Ordered by the code itself: the sequence is zero-padded to a fixed width,
  // so lexical order is numeric order.
  const last = await db.sample.findFirst({
    where: { sampleCode: { startsWith: head } },
    orderBy: { sampleCode: "desc" },
    select: { sampleCode: true },
  });
  if (!last) return 0;

  const sequence = parseInt(last.sampleCode.slice(head.length), 10);
  return Number.isNaN(sequence) ? 0 : sequence;
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
