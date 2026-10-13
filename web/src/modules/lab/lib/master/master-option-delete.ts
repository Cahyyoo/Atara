import "server-only";

import type { MasterKind, Prisma } from "@prisma/client";
import { composeSampleIdent, duplicateIdents } from "@/modules/lab/lib/samples/sample-ident";
import { identityInclude } from "@/modules/lab/lib/samples/sample-ident-server";

/** The lab-record column each kind of code is linked through. */
export const KIND_FIELD = {
  PLACE: "placeId",
  ROCK_TYPE: "rockTypeId",
  NON_PROD: "nonProdId",
  PIT: "pitId",
  SIR: "sirId",
} as const satisfies Record<MasterKind, string>;

/** Which part of the Sample ID each kind fills. */
const KIND_PART = {
  PLACE: "place",
  ROCK_TYPE: "rockType",
  NON_PROD: "nonProd",
  PIT: "pit",
  SIR: "sir",
} as const satisfies Record<MasterKind, string>;

/** How many before/after pairs the confirmation shows. */
const EXAMPLES = 5;

interface Code {
  id: string;
  kind: MasterKind;
  code: string;
}

export interface ReplacementMove {
  id: string;
  labCode: string;
  from: string | null;
  to: string | null;
}

export interface ReplacementPlan {
  moves: ReplacementMove[];
  /** New Sample IDs that some other sample already has, or that two moves share. */
  clashes: string[];
}

/** What the confirmation dialog is shown before anything is written. */
export function summarizePlan(plan: ReplacementPlan) {
  return {
    affected: plan.moves.length,
    examples: plan.moves
      .filter((move) => move.from !== move.to)
      .slice(0, EXAMPLES)
      .map(({ labCode, from, to }) => ({ labCode, from, to })),
    clashes: plan.clashes,
  };
}

/**
 * What deleting `option` in favour of `replacement` would do to every lab
 * record that uses it -- including records of deleted samples, which still
 * point at the code and would otherwise lose it.
 *
 * The Sample ID is stored text with the code inside it, so each one is
 * composed again with the replacement's code, exactly as an identity edit
 * would. Read-only: nothing is written here.
 */
export async function planReplacement(
  tx: Prisma.TransactionClient,
  option: Code,
  replacement: Code
): Promise<ReplacementPlan> {
  const field = KIND_FIELD[option.kind];
  const part = KIND_PART[option.kind];

  const records = await tx.labRecord.findMany({
    where: { [field]: option.id },
    include: identityInclude,
  });

  const moves = records.map((record) => {
    const parts = {
      place: record.place?.code ?? null,
      rockType: record.rockType?.code ?? null,
      nonProd: record.nonProd?.code ?? null,
      pit: record.pit?.code ?? null,
      sir: record.sir?.code ?? null,
      bargingNo: record.bargingNo,
      sequenceNo: record.sequenceNo,
      sampleNo: record.sampleNo,
      sackCount: record.sackCount,
    };
    return {
      id: record.id,
      labCode: record.labCode,
      from: record.sampleIdent,
      to: composeSampleIdent({ ...parts, [part]: replacement.code }),
    };
  });

  const wanted = moves.map((move) => move.to).filter((value): value is string => value !== null);
  const taken = wanted.length
    ? await tx.labRecord.findMany({
        where: { sampleIdent: { in: wanted }, id: { notIn: moves.map((move) => move.id) } },
        select: { sampleIdent: true },
      })
    : [];

  const clashes = [
    ...new Set([
      ...taken.map((row) => row.sampleIdent!),
      ...duplicateIdents(moves.map((move) => move.to)),
    ]),
  ].sort();

  return { moves, clashes };
}

/**
 * Moves every record onto the replacement and rewrites its Sample ID, leaving
 * a line in each record's history saying why.
 *
 * The history stores the two codes rather than their ids: the old option is
 * about to stop existing, and the history panel shows any value it cannot
 * look up as it stands -- so "LAM → MOL" stays readable for good.
 */
export async function applyReplacement(
  tx: Prisma.TransactionClient,
  plan: ReplacementPlan,
  option: Code,
  replacement: Code,
  userId: string
): Promise<void> {
  const field = KIND_FIELD[option.kind];
  const reason = `Master data: ${option.code} deleted, replaced by ${replacement.code}`;

  // The ids first, all at once, so no Sample ID is rewritten while another
  // record still holds the text it is moving to.
  for (const move of plan.moves) {
    if (move.from !== move.to) {
      await tx.labRecord.update({ where: { id: move.id }, data: { sampleIdent: null } });
    }
  }

  for (const move of plan.moves) {
    const changes: Record<string, { from: string | null; to: string | null }> = {
      [field]: { from: option.code, to: replacement.code },
    };
    if (move.from !== move.to) {
      changes.sampleIdent = { from: move.from, to: move.to };
    }

    await tx.labRecord.update({
      where: { id: move.id },
      data: { [field]: replacement.id, sampleIdent: move.to, updatedById: userId },
    });
    await tx.labRecordAudit.create({
      data: {
        labRecordId: move.id,
        changedById: userId,
        changes: changes as unknown as Prisma.InputJsonObject,
        reason,
      },
    });
  }
}
