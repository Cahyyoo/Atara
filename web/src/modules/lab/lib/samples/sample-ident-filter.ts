import type { Prisma } from "@prisma/client";

/**
 * Samples with, or still without, a Sample ID. Barcodes are made first and
 * identified afterwards, so "which have no Sample ID yet" is a list somebody
 * works through. A sample with no lab record at all has none either.
 */
export function sampleIdentWhere(ident: "has" | "missing" | undefined): Prisma.SampleWhereInput {
  if (ident === "has") return { labRecord: { is: { sampleIdent: { not: null } } } };
  if (ident === "missing") {
    return { OR: [{ labRecord: { is: null } }, { labRecord: { is: { sampleIdent: null } } }] };
  }
  return {};
}
