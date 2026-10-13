import type { MasterKind } from "@/modules/lab/types";

/** The identity dimensions the dashboard can be sliced by, in the order shown. */
export const IDENTITY_FILTERS = [
  { key: "placeId", kind: "PLACE" },
  { key: "rockTypeId", kind: "ROCK_TYPE" },
  { key: "nonProdId", kind: "NON_PROD" },
  { key: "sirId", kind: "SIR" },
  { key: "pitId", kind: "PIT" },
] as const satisfies readonly { key: string; kind: MasterKind }[];

export type IdentityKey = (typeof IDENTITY_FILTERS)[number]["key"];

/** Every dimension unfiltered: the starting point, and what a full reset goes back to. */
export function unfilteredIdentity(): Record<IdentityKey, string> {
  return Object.fromEntries(IDENTITY_FILTERS.map(({ key }) => [key, "ALL"])) as Record<
    IdentityKey,
    string
  >;
}
