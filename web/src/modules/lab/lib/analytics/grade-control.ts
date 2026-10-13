import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { identitySql, recordSampleJoinSql } from "@/modules/lab/lib/analytics/analytics-sql";
import { type AnalyticsFilter } from "@/modules/lab/lib/analytics/analytics-types";
import { subsSql } from "@/modules/lab/lib/records/sub-filter-sql";
import { activeSampleWindowSql } from "@/modules/lab/lib/samples/soft-delete";
import {
  GRADE_FIELDS,
  GRADE_GROUPS,
  GRADE_GROUP_KEYS,
  NO_CODE,
  OPTION_GRADE_GROUPS,
  UNGROUPED_ID,
  type GradeField,
  type GradeGroup,
} from "@/modules/lab/lib/analytics/grade-groups";

export interface GradeRow {
  /** The combination's ids joined, unique per row; UNGROUPED_ID stands for an empty one. */
  key: string;
  /** The code in each chosen dimension; "—" where the samples have none. */
  codes: Partial<Record<GradeGroup, string>>;
  /** Samples in the window with this combination. */
  samples: number;
  /** Of those, how many have a Ni result; the averages are over these. */
  assayed: number;
  niMin: number | null;
  niMax: number | null;
  avg: Record<GradeField, number | null>;
}

export interface GradeControlResult {
  range: { from: string; to: string };
  /** The dimensions grouped by, in their fixed order. */
  groupBy: GradeGroup[];
  rows: GradeRow[];
}

const round = (value: unknown, digits = 3): number | null => {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

/**
 * Average grades per pit, SIR, place, rock type or non-prod code -- or any
 * combination of them, one row per combination that occurs (A4 · SAP,
 * A4 · LIM, ...) -- for the samples created in a window: the same window and
 * filters the dashboard uses, so the two never disagree about which samples
 * are "this week".
 *
 * One aggregate in MySQL. Samples without a Ni result still count towards
 * the row's size, so a group whose results are missing shows as such rather
 * than vanishing; the averages are over the assayed ones only.
 */
export async function buildGradeControl(
  from: Date,
  to: Date,
  groups: readonly GradeGroup[],
  filter: AnalyticsFilter = {}
): Promise<GradeControlResult> {
  // Fixed order and no repeats, whatever the caller passed; never empty.
  const groupBy = GRADE_GROUP_KEYS.filter((key) => groups.includes(key));
  if (groupBy.length === 0) groupBy.push("pit");

  // Column names come from the whitelist, never from the request.
  const columns = groupBy.map((group, index) =>
    // A barging run is typed: " b10" and "B10" are one run, and an empty one
    // is none, like a missing pit.
    Prisma.raw(
      group === "barging"
        ? `NULLIF(UPPER(TRIM(r.${GRADE_GROUPS[group]})), '') AS g${index}`
        : `r.${GRADE_GROUPS[group]} AS g${index}`
    )
  );
  const groupKeys = Prisma.raw(groupBy.map((_, index) => `g${index}`).join(", "));
  const averages = Prisma.join(
    GRADE_FIELDS.map((field) => Prisma.sql`AVG(${Prisma.raw(`r.${field}`)}) AS ${Prisma.raw(`avg_${field}`)}`),
    ", "
  );

  const rows = await prisma.$queryRaw<
    (Record<`g${number}`, string | null> & {
      samples: bigint;
      assayed: bigint;
      ni_min: Prisma.Decimal | null;
      ni_max: Prisma.Decimal | null;
    } & Record<`avg_${GradeField}`, Prisma.Decimal | null>)[]
  >`
    SELECT ${Prisma.join(columns, ", ")},
           COUNT(*) AS samples,
           COUNT(r.ni) AS assayed,
           MIN(r.ni) AS ni_min,
           MAX(r.ni) AS ni_max,
           ${averages}
    FROM lab_records r
    ${recordSampleJoinSql("r")}
    WHERE ${activeSampleWindowSql(from, to)}
      ${identitySql(filter, "r")}
      ${subsSql(filter.subs ?? "parents", "r")}
    GROUP BY ${groupKeys}
  `;

  const idsOf = (row: (typeof rows)[number]) =>
    groupBy.map((_, index) => row[`g${index}`] ?? null);

  // Only the option groups hold ids to read back; a barging run is its own text.
  const optionIndexes = groupBy.flatMap((group, index) => (OPTION_GRADE_GROUPS.includes(group) ? [index] : []));
  const ids = [
    ...new Set(
      rows.flatMap((row) => optionIndexes.map((index) => row[`g${index}`] ?? null)).filter((id): id is string => id !== null)
    ),
  ];
  const options = ids.length
    ? await prisma.masterOption.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      })
    : [];
  const codeById = new Map(options.map((option) => [option.id, option.code]));

  const result: GradeRow[] = rows.map((row) => {
    const rowIds = idsOf(row);
    return {
      key: rowIds.map((id) => id ?? UNGROUPED_ID).join("|"),
      codes: Object.fromEntries(
        groupBy.map((group, index) => {
          const id = rowIds[index];
          return [group, id ? (codeById.get(id) ?? id) : NO_CODE];
        })
      ),
      samples: Number(row.samples),
      assayed: Number(row.assayed),
      niMin: round(row.ni_min),
      niMax: round(row.ni_max),
      avg: Object.fromEntries(
        GRADE_FIELDS.map((field) => [field, round(row[`avg_${field}`])])
      ) as Record<GradeField, number | null>,
    };
  });

  // Highest Ni first; combinations with no results at all last, then by code.
  const label = (row: GradeRow) => groupBy.map((group) => row.codes[group]).join(" · ");
  result.sort((a, b) => (b.avg.ni ?? -1) - (a.avg.ni ?? -1) || label(a).localeCompare(label(b)));

  return { range: { from: from.toISOString(), to: to.toISOString() }, groupBy, rows: result };
}
