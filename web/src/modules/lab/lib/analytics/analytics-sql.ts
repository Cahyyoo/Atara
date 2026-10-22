/** SQL fragments the lab's aggregates share: joining a record to its sample, and the identity filter. */
import { Prisma } from "@prisma/client";
import { AnalyticsFilter } from "@/modules/lab/lib/analytics/analytics-types";

/** Lab-record rows joined to the sample they belong to: their own, or their parent's. */
export function recordSampleJoinSql(alias = "r", sampleAlias = "s"): Prisma.Sql {
  const r = Prisma.raw(alias);
  const s = Prisma.raw(sampleAlias);
  const p = Prisma.raw(`${alias}_parent`);
  return Prisma.sql`LEFT JOIN lab_records ${p} ON ${p}.id = ${r}.parent_id
    JOIN lab_samples ${s} ON ${s}.id = COALESCE(${r}.sample_id, ${p}.sample_id)`;
}

/**
 * The identity dimensions the dashboard can be sliced by, each paired with the
 * column it lives in.
 *
 * One list, two shapes: the Prisma `where` below and the raw-SQL fragments the
 * aggregates use. Keeping them derived from this rather than written out twice
 * is the whole point — two hand-maintained lists drift, and the symptom is a
 * dashboard whose cards quietly disagree with each other.
 */
const IDENTITY_COLUMNS = {
  placeId: "place_id",
  rockTypeId: "rock_type_id",
  nonProdId: "non_prod_id",
  pitId: "pit_id",
  sirId: "sir_id",
} as const satisfies Record<Exclude<keyof AnalyticsFilter, "subs">, string>;

type IdentityKey = keyof typeof IDENTITY_COLUMNS;

export function activeIdentity(filter: AnalyticsFilter): [IdentityKey, string][] {
  return (Object.keys(IDENTITY_COLUMNS) as IdentityKey[])
    .map((key) => [key, filter[key]] as const)
    .filter((entry): entry is [IdentityKey, string] => Boolean(entry[1]));
}

/** `AND <alias>.<column> = ?` for each active dimension, joined with AND. */
export function identitySql(filter: AnalyticsFilter, alias: string): Prisma.Sql {
  const active = activeIdentity(filter);
  if (active.length === 0) return Prisma.empty;

  return Prisma.join(
    active.map(([key, value]) =>
      // The column name is from the map above, never from the request; only the
      // value is interpolated, and that stays a bound parameter.
      Prisma.sql`AND ${Prisma.raw(`${alias}.${IDENTITY_COLUMNS[key]}`)} = ${value}`
    ),
    " "
  );
}
