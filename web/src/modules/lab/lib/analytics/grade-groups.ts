/**
 * The grade-control groupings and grades, with no server imports, so the page
 * can offer the same choices the route accepts.
 */

/** What the grades can be grouped by, and the column each lives in. */
export const GRADE_GROUPS = {
  pit: "pit_id",
  sir: "sir_id",
  place: "place_id",
  rockType: "rock_type_id",
  nonProd: "non_prod_id",
  // Typed in rather than chosen from master data: grouped as written, the
  // spelling evened out (see grade-control.ts).
  barging: "barging_no",
} as const;

/** The groups that name a master option by id, read back as its code. */
export const OPTION_GRADE_GROUPS: readonly GradeGroup[] = ["pit", "sir", "place", "rockType", "nonProd"];

export type GradeGroup = keyof typeof GRADE_GROUPS;

export const GRADE_GROUP_KEYS = Object.keys(GRADE_GROUPS) as GradeGroup[];

/** The grades averaged, beside Ni: the ones a nickel lab reports first. */
export const GRADE_FIELDS = ["ni", "fe", "co", "mgo", "sio2"] as const;

export type GradeField = (typeof GRADE_FIELDS)[number];

/** The bar standing for samples with nothing in the grouped column. */
export const UNGROUPED_ID = "__none__";

/** The code written for samples with nothing in a grouped column. */
export const NO_CODE = "—";

/** What `groupBy=pit,rockType` asks for, in the fixed order; nothing valid means Pit. */
export function parseGradeGroups(value: string | null | undefined): GradeGroup[] {
  const asked = new Set((value ?? "").split(",").map((part) => part.trim()));
  const groups = GRADE_GROUP_KEYS.filter((key) => asked.has(key));
  return groups.length > 0 ? groups : ["pit"];
}

/** The URL form of a set of groups, in the same fixed order. */
export function formatGradeGroups(groups: readonly GradeGroup[]): string {
  return GRADE_GROUP_KEYS.filter((key) => groups.includes(key)).join(",");
}
