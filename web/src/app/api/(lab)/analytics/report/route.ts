import { prisma } from "@/core/lib/prisma";
import { route } from "@/core/lib/http/api-route";
import { analyticsQuerySchema } from "@/modules/lab/validation/reports";
import { cachedAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { resolveAnalyticsRange } from "@/modules/lab/lib/analytics/analytics-range";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { workbookResponse } from "@/core/lib/sheets/xlsx-workbook";

const FILTER_LABELS = {
  placeId: "Place",
  rockTypeId: "Ore class",
  nonProdId: "Non-prod",
  sirId: "SIR",
  pitId: "Pit",
} as const;

/**
 * The dashboard's figures as a workbook: the same window and filters, from
 * the same cached computation, so the file always agrees with the screen it
 * was downloaded from. One sheet per section, for somebody writing the daily
 * or weekly lab report.
 */
export const GET = route({ capability: "exportDatabase" }, async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const { from, to, ...identity } = analyticsQuerySchema.parse(Object.fromEntries(searchParams));
  const range = resolveAnalyticsRange(from, to);
  // A file people keep: always the numbers as they are now, never the last ones.
  const data = await cachedAnalytics(range.from, range.to, identity, Date.now(), { allowStale: false });

  // Filters by their codes: an id in a report means nothing to its reader.
  const filterEntries = Object.entries(identity).filter(
    (entry): entry is [keyof typeof FILTER_LABELS, string] => Boolean(entry[1])
  );
  const options = await prisma.masterOption.findMany({
    where: { id: { in: filterEntries.map(([, id]) => id) } },
    select: { id: true, code: true },
  });
  const codeById = new Map(options.map((option) => [option.id, option.code]));
  const filterText =
    filterEntries
      .map(([key, id]) => `${FILTER_LABELS[key]}: ${codeById.get(id) ?? id}`)
      .join(", ") || "None";

  const overdueShown = data.overdueSamples.length;
  const summary: [string, string | number | null][] = [
    ["From", formatWitaDateTime(data.range.from)],
    ["To", formatWitaDateTime(data.range.to)],
    ["Filters", filterText],
    ["Generated at", formatWitaDateTime(data.generatedAt)],
    ["Samples", data.kpi.total],
    ["Pending", data.kpi.pending],
    ["In progress", data.kpi.inProgress],
    ["Completed", data.kpi.completed],
    ["Awaiting assay", data.kpi.awaitingAssay],
    ["Past SLA", data.kpi.overdue],
    ["Average cycle time (hours)", data.kpi.averageCycleHours],
  ];
  // The list is capped at MAX_OVERDUE_ROWS; the count above it is exact.
  if (data.kpi.overdue > overdueShown) {
    summary.push([
      "Note",
      `The Past SLA sheet lists the ${overdueShown} longest-waiting of ${data.kpi.overdue}.`,
    ]);
  }

  const day = (iso: string) => iso.slice(0, 10);
  return await workbookResponse(`lab-summary-${day(data.range.from)}-to-${day(data.range.to)}`, [
    {
      name: "Summary",
      columns: [
        { header: "Item", key: "item", width: 28 },
        { header: "Value", key: "value", width: 44 },
      ],
      rows: summary.map(([item, value]) => ({ item, value })),
    },
    {
      name: "Daily throughput",
      columns: [
        { header: "Shift date", key: "shiftDate", width: 14 },
        { header: "Created", key: "created" },
        { header: "Completed", key: "completed" },
      ],
      rows: data.throughput,
    },
    {
      name: "Stage durations",
      columns: [
        { header: "Stage", key: "stageName", width: 18 },
        { header: "Average hours", key: "averageHours", width: 16 },
        { header: "Samples", key: "samples" },
      ],
      rows: data.stageDurations.map(({ stageName, averageHours, samples }) => ({
        stageName,
        averageHours,
        samples,
      })),
    },
    {
      name: "Waiting per stage",
      columns: [
        { header: "Stage", key: "stageName", width: 18 },
        { header: "Samples waiting", key: "count", width: 18 },
      ],
      rows: data.bottleneck.map(({ stageName, count }) => ({ stageName, count })),
    },
    {
      name: "Per place",
      columns: [
        { header: "Place", key: "code", width: 18 },
        { header: "Samples", key: "count" },
      ],
      rows: data.placeSplit.map(({ code, count }) => ({ code, count })),
    },
    {
      name: "Past SLA",
      columns: [
        { header: "Barcode Code", key: "sampleCode", width: 18 },
        { header: "Lab Code", key: "labCode", width: 16 },
        { header: "Sample ID", key: "sampleIdent", width: 36 },
        { header: "Stage", key: "stageName", width: 16 },
        { header: "Hours in stage", key: "hoursInStage", width: 16 },
        { header: "SLA (hours)", key: "slaHours" },
      ],
      rows: data.overdueSamples.map(
        ({ sampleCode, labCode, sampleIdent, stageName, hoursInStage, slaHours }) => ({
          sampleCode,
          labCode,
          sampleIdent,
          stageName,
          hoursInStage,
          slaHours,
        })
      ),
    },
  ]);
});
