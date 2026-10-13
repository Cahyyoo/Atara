import { z } from "zod";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { analyticsQuerySchema } from "@/modules/lab/validation/reports";
import { resolveAnalyticsRange } from "@/modules/lab/lib/analytics/analytics-range";
import { buildGradeControl } from "@/modules/lab/lib/analytics/grade-control";
import { GRADE_FIELDS, GRADE_GROUP_KEYS, parseGradeGroups } from "@/modules/lab/lib/analytics/grade-groups";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { workbookResponse } from "@/core/lib/sheets/xlsx-workbook";

const gradeQuerySchema = analyticsQuerySchema.extend({
  /** One dimension or several, comma-separated: "pit" or "pit,rockType". */
  groupBy: z
    .string()
    .trim()
    .default("pit")
    .refine(
      (value) => value.split(",").every((part) => (GRADE_GROUP_KEYS as string[]).includes(part.trim())),
      { message: `Group by one or more of: ${GRADE_GROUP_KEYS.join(", ")}.` }
    ),
  format: z.enum(["json", "xlsx"]).default("json"),
});

const GROUP_LABELS: Record<string, string> = {
  pit: "Pit",
  sir: "SIR",
  place: "Place",
  rockType: "Ore class",
  nonProd: "Non-prod",
  barging: "Barging run",
};

const FIELD_LABELS: Record<(typeof GRADE_FIELDS)[number], string> = {
  ni: "Ni",
  fe: "Fe",
  co: "Co",
  mgo: "MgO",
  sio2: "SiO2",
};

/**
 * Average grades per pit, SIR, place, rock type or non-prod code -- or a
 * combination of them -- for the people who read results: the same window
 * and filters as the dashboard. `format=xlsx` returns the same table as a
 * workbook, one column per dimension.
 */
export const GET = route({ capability: "readLabRecords" }, async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const { from, to, groupBy, format, ...identity } = gradeQuerySchema.parse(
    Object.fromEntries(searchParams)
  );
  const range = resolveAnalyticsRange(from, to);
  const result = await buildGradeControl(range.from, range.to, parseGradeGroups(groupBy), identity);

  if (format === "json") {
    return jsonSuccess(result);
  }

  const day = (iso: string) => iso.slice(0, 10);
  const groupNames = result.groupBy.map((group) => GROUP_LABELS[group] ?? group);
  return await workbookResponse(
    `conclusion-${result.groupBy.join("-")}-${day(result.range.from)}-to-${day(result.range.to)}`,
    [
      {
        name: "Conclusion",
        columns: [
          ...result.groupBy.map((group) => ({ header: GROUP_LABELS[group] ?? group, key: group, width: 14 })),
          { header: "Samples", key: "samples" },
          { header: "Assayed", key: "assayed" },
          { header: "Ni min (%)", key: "niMin" },
          { header: "Ni max (%)", key: "niMax" },
          ...GRADE_FIELDS.map((field) => ({
            header: `${FIELD_LABELS[field]} avg (%)`,
            key: field,
            width: 14,
          })),
        ],
        rows: result.rows.map((row) => ({
          ...row.codes,
          samples: row.samples,
          assayed: row.assayed,
          niMin: row.niMin,
          niMax: row.niMax,
          ...row.avg,
        })),
      },
      {
        name: "About",
        columns: [
          { header: "Item", key: "item", width: 18 },
          { header: "Value", key: "value", width: 40 },
        ],
        rows: [
          { item: "From", value: formatWitaDateTime(result.range.from) },
          { item: "To", value: formatWitaDateTime(result.range.to) },
          { item: "Grouped by", value: groupNames.join(" + ") },
          { item: "Averages over", value: "Samples with a Ni result" },
        ],
      },
    ]
  );
});
