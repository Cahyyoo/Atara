import type { Prisma } from "@prisma/client";
import { composeSampleIdent } from "@/modules/lab/lib/samples/sample-ident";

/** The master options a Sample ID is built from, in one include. */
export const identityInclude = {
  place: { select: { code: true } },
  rockType: { select: { code: true } },
  nonProd: { select: { code: true } },
  pit: { select: { code: true } },
  sir: { select: { code: true } },
} satisfies Prisma.LabRecordInclude;

export interface IdentityInput {
  placeId?: string | null;
  rockTypeId?: string | null;
  nonProdId?: string | null;
  pitId?: string | null;
  sirId?: string | null;
  bargingNo?: string | null;
  sequenceNo?: number | null;
  sampleNo?: number | null;
  sackCount?: number | null;
}

export const OPTION_FIELDS = ["placeId", "rockTypeId", "nonProdId", "pitId", "sirId"] as const;

/** The Sample ID a complete identity composes, given the codes of its options. */
export function composeWithCodes(identity: IdentityInput, codeById: Map<string, string>): string | null {
  const code = (id: string | null | undefined) => (id ? codeById.get(id) : null);
  return composeSampleIdent({
    place: code(identity.placeId),
    rockType: code(identity.rockTypeId),
    nonProd: code(identity.nonProdId),
    pit: code(identity.pitId),
    sir: code(identity.sirId),
    bargingNo: identity.bargingNo,
    sequenceNo: identity.sequenceNo,
    sampleNo: identity.sampleNo,
    sackCount: identity.sackCount,
  });
}

/** The codes of every option the identities name, in one query. */
export async function optionCodes(
  db: Prisma.TransactionClient,
  identities: readonly IdentityInput[]
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      identities.flatMap((identity) =>
        OPTION_FIELDS.map((field) => identity[field]).filter(
          (value): value is string => typeof value === "string"
        )
      )
    ),
  ];
  const options = ids.length
    ? await db.masterOption.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })
    : [];
  return new Map(options.map((option) => [option.id, option.code]));
}

/**
 * Every column the Sample ID is built from. A caller uses this to ask whether an
 * update can have moved the id at all, and skip the work when it cannot.
 */
export const IDENTITY_FIELDS = [
  ...OPTION_FIELDS,
  "bargingNo",
  "sequenceNo",
  "sampleNo",
  "sackCount",
] as const satisfies readonly (keyof IdentityInput)[];

/**
 * Recomposes `sampleIdent` from whatever the record will hold once an update is
 * applied.
 *
 * The id is stored rather than derived on read, so it has to be rebuilt on
 * every write that could move one of its parts — otherwise a corrected pit
 * would leave the old pit sitting in the id, and the id is what the pasted
 * spreadsheet rows are matched against.
 *
 * Returns undefined when the update touches none of the parts, so callers can
 * leave the column alone rather than rewriting it to the same value.
 */
export async function resolveSampleIdent(
  db: Prisma.TransactionClient,
  current: IdentityInput,
  update: IdentityInput
): Promise<string | null | undefined> {
  const touched = (Object.keys(update) as (keyof IdentityInput)[]).some(
    (key) => update[key] !== undefined
  );
  if (!touched) return undefined;

  const merged: IdentityInput = { ...current };
  for (const key of Object.keys(update) as (keyof IdentityInput)[]) {
    if (update[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = update[key];
    }
  }

  // One query for all five, then looked up by id: five findUnique calls would
  // be five round trips for a form that changes one dropdown.
  return composeWithCodes(merged, await optionCodes(db, [merged]));
}
