import type { Prisma } from "@prisma/client";
import type { MasterOptionDTO } from "@/types";

/**
 * How many lab records point at an option, counted across all five identity
 * columns at once.
 *
 * An option of one kind can only ever be referenced through its own column, so
 * four of these are always zero — but counting all five means the shape does
 * not depend on the kind, and nothing has to stay in step with it.
 */
export const masterOptionCount = {
  _count: {
    select: {
      placeRecords: true,
      rockTypeRecords: true,
      nonProdRecords: true,
      pitRecords: true,
      sirRecords: true,
    },
  },
} satisfies Prisma.MasterOptionInclude;

type CountedOption = Prisma.MasterOptionGetPayload<{ include: typeof masterOptionCount }>;
type PlainOption = Omit<CountedOption, "_count"> & { _count?: CountedOption["_count"] };

export function usageOf(option: { _count: CountedOption["_count"] }): number {
  const counts = option._count;
  return (
    counts.placeRecords +
    counts.rockTypeRecords +
    counts.nonProdRecords +
    counts.pitRecords +
    counts.sirRecords
  );
}

/** With `_count` present the usage is reported; without, it is simply not known. */
export function toMasterOptionDTO(option: PlainOption): MasterOptionDTO {
  return {
    id: option.id,
    kind: option.kind,
    code: option.code,
    label: option.label,
    sortOrder: option.sortOrder,
    isActive: option.isActive,
    ...(option._count ? { usageCount: usageOf({ _count: option._count }) } : {}),
  };
}
