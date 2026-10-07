import { Prisma } from "@prisma/client";
import { formatShiftDate } from "@/lib/shift-date";

export interface AllocatedLabCode {
  sequence: number;
  labCode: string;
}

/** Fixed prefix: the code no longer carries the place the sample came from. */
export const LAB_CODE_PREFIX = "SPR.QLAB";

/** Three digits covers a day's work; the constraint, not the padding, guards uniqueness. */
const SEQUENCE_DIGITS = 3;

export function formatLabCode(shiftDate: Date, sequence: number): string {
  return `${LAB_CODE_PREFIX}.${formatShiftDate(shiftDate)}.${String(sequence).padStart(SEQUENCE_DIGITS, "0")}`;
}

/**
 * Reserves the next `count` lab codes for a shift day, e.g. SPR.QLAB.20260917.001.
 *
 * One run of numbers per shift day. The old format kept a separate run per
 * LAM/MOL because the code carried that prefix; SPR does not, so two samples
 * from different places now take consecutive numbers rather than both being
 * "0001".
 *
 * Takes the client to run on so the read of the last sequence and the inserts
 * that follow stay inside one transaction.
 */
export async function allocateLabCodes(
  db: Prisma.TransactionClient,
  count: number,
  shiftDate: Date
): Promise<AllocatedLabCode[]> {
  const lastRecord = await db.labRecord.findFirst({
    where: { shiftDate },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  const firstSequence = (lastRecord?.sequence ?? 0) + 1;

  const codes: AllocatedLabCode[] = [];
  for (let index = 0; index < count; index++) {
    const sequence = firstSequence + index;
    codes.push({ sequence, labCode: formatLabCode(shiftDate, sequence) });
  }
  return codes;
}
