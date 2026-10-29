import "server-only";
import { prisma } from "@/core/lib/prisma";
import { CONTROL_ELEMENTS } from "@/modules/eksplorasi/lib/qc-control";
import { duplicatePairs, type DuplicateRow } from "@/modules/eksplorasi/lib/qc-duplicate";
import type { QcDuplicate } from "@/modules/eksplorasi/types";
import { duplicatesCache } from "@/modules/eksplorasi/lib/eksplorasi-cache";

/**
 * The dashboard's duplicate charts: every DUPLICATE row of the data source
 * beside the FIELD sample its Remarks (original_sample_id_remarks) names --
 * the Sample ID picked in the Duplicate list's dropdown. A Remarks that names
 * no FIELD sample (blank, free text written before the dropdown) has no pair,
 * and is counted rather than guessed at.
 */

/** As the control charts: past this a scatter is a smear. */
const MAX_PAIRS = 5_000;

/** Held a moment (eksplorasi-cache.ts); any write to the data source empties it. */
export function loadDuplicateCharts(): Promise<QcDuplicate> {
  return duplicatesCache.get("duplicates", computeDuplicateCharts);
}

async function computeDuplicateCharts(): Promise<QcDuplicate> {
  const [rows, [{ n: unmatched }]] = await Promise.all([
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
      ORDER BY d.created_at, d.id
      LIMIT ${MAX_PAIRS + 1}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n
      FROM eksplorasi_data_source AS d
      WHERE d.sample_type = 'DUPLICATE'
        AND NOT EXISTS (
          SELECT 1 FROM eksplorasi_data_source AS o
          WHERE o.sample_id = TRIM(d.original_sample_id_remarks) AND o.sample_type = 'FIELD'
        )`,
  ]);

  const shown = rows.slice(0, MAX_PAIRS);
  return {
    elements: CONTROL_ELEMENTS.map((element) => ({ element, ...duplicatePairs(shown, element) })),
    unmatched: Number(unmatched),
    truncated: rows.length > MAX_PAIRS,
  };
}
