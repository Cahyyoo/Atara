import "server-only";
import type { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { CONTROL_ELEMENTS } from "@/modules/eksplorasi/lib/qc-control";
import { duplicatePairs, monthRange, type DuplicateRow } from "@/modules/eksplorasi/lib/qc-duplicate";
import type { qcDuplicateQuerySchema } from "@/modules/eksplorasi/validation";
import type { QcDuplicate } from "@/modules/eksplorasi/types";
import { duplicatesCache } from "@/modules/eksplorasi/lib/eksplorasi-cache";

/**
 * The dashboard's duplicate charts and table: every DUPLICATE row of the
 * data source -- of one campaign and one month of its date, or of all --
 * beside the FIELD sample its Remarks (original_sample_id_remarks) names,
 * the Sample ID picked in the Duplicate list's dropdown. A Remarks that
 * names no FIELD sample (blank, free text written before the dropdown) has
 * no pair, and is counted rather than guessed at.
 */

/** As the control charts: past this a scatter is a smear. */
const MAX_PAIRS = 5_000;

type Query = z.output<typeof qcDuplicateQuerySchema>;

/** Held a moment per campaign and month (eksplorasi-cache.ts); any write to the data source empties it. */
export function loadDuplicateCharts(query: Query): Promise<QcDuplicate> {
  return duplicatesCache.get(`${query.campaign ?? ""}|${query.month ?? ""}`, () => computeDuplicateCharts(query));
}

/** The campaigns and months (YYYY-MM, latest first) that have duplicates, for the choices. */
async function duplicateFilters(): Promise<{ campaigns: string[]; months: string[] }> {
  const [campaigns, months] = await Promise.all([
    prisma.dataSource.findMany({
      where: { sampleType: "DUPLICATE", campaign: { not: null } },
      distinct: ["campaign"],
      select: { campaign: true },
      orderBy: { campaign: "asc" },
      take: 500,
    }),
    prisma.$queryRaw<{ m: string }[]>`
      SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') AS m
      FROM eksplorasi_data_source
      WHERE sample_type = 'DUPLICATE' AND date IS NOT NULL
      ORDER BY m DESC
      LIMIT 240`,
  ]);
  return {
    campaigns: campaigns.flatMap((row) => (row.campaign ? [row.campaign] : [])),
    months: months.map((row) => row.m),
  };
}

async function computeDuplicateCharts({ campaign = null, month = null }: { campaign?: string | null; month?: string | null }): Promise<QcDuplicate> {
  // A month as a range of the date, so the column's index still serves.
  const { from, to } = month ? monthRange(month) : { from: null, to: null };
  const [rows, [{ n: unmatched }], filters] = await Promise.all([
    // The original found by its unique Sample ID; the earliest duplicates first.
    prisma.$queryRaw<DuplicateRow[]>`
      SELECT d.sample_id AS sampleId, o.sample_id AS originalId,
             d.ni AS d_ni, d.co AS d_co, d.fe2o3 AS d_fe2o3, d.al2o3 AS d_al2o3,
             d.cr2o3 AS d_cr2o3, d.mgo AS d_mgo, d.sio2 AS d_sio2,
             o.ni AS o_ni, o.co AS o_co, o.fe2o3 AS o_fe2o3, o.al2o3 AS o_al2o3,
             o.cr2o3 AS o_cr2o3, o.mgo AS o_mgo, o.sio2 AS o_sio2
      FROM eksplorasi_data_source AS d
      JOIN eksplorasi_data_source AS o
        ON o.sample_id = TRIM(d.original_sample_id_remarks) AND o.sample_type = 'FIELD'
      WHERE d.sample_type = 'DUPLICATE'
        AND (${campaign} IS NULL OR d.campaign = ${campaign})
        AND (${from} IS NULL OR (d.date >= ${from} AND d.date < ${to}))
      ORDER BY d.created_at, d.id
      LIMIT ${MAX_PAIRS + 1}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n
      FROM eksplorasi_data_source AS d
      WHERE d.sample_type = 'DUPLICATE'
        AND (${campaign} IS NULL OR d.campaign = ${campaign})
        AND (${from} IS NULL OR (d.date >= ${from} AND d.date < ${to}))
        AND NOT EXISTS (
          SELECT 1 FROM eksplorasi_data_source AS o
          WHERE o.sample_id = TRIM(d.original_sample_id_remarks) AND o.sample_type = 'FIELD'
        )`,
    duplicateFilters(),
  ]);

  const shown = rows.slice(0, MAX_PAIRS);
  return {
    ...filters,
    campaign,
    month,
    elements: CONTROL_ELEMENTS.map((element) => ({ element, ...duplicatePairs(shown, element) })),
    unmatched: Number(unmatched),
    truncated: rows.length > MAX_PAIRS,
  };
}
