import "server-only";
import type { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { dayOf } from "@/modules/eksplorasi/lib/data-source";
import {
  CONTROL_ELEMENTS,
  CONTROL_TEST_METHOD,
  controlLimits,
  controlPoints,
  crmKey,
  sdFieldOf,
  type ControlElement,
} from "@/modules/eksplorasi/lib/qc-control";
import type { qcControlQuerySchema } from "@/modules/eksplorasi/validation";
import { controlCache } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import type { QcControl } from "@/modules/eksplorasi/types";

/**
 * The dashboard's control charts for one OREAS standard: its assays from the
 * data source, against its certified values and SDs from the CRM List (the
 * Fusion XRF row).
 *
 * The sample index is the row's place in the whole data source, in the order
 * the rows came in (created_at, then the cuid, which Prisma hands out in
 * sequence even within one createMany). It is counted over every row --
 * field samples, blanks, duplicates -- so a standard sits where the lab's
 * sheet has it.
 */

/** As the other dashboard charts: past this a scatter is a smear. */
const MAX_POINTS = 5_000;

type Query = z.output<typeof qcControlQuerySchema>;

type AssayRow = { sample_id: string; date: Date | null; idx: bigint } & Record<ControlElement, string | null>;

/** The standards the CRM List certifies for the charts' test method, by name. */
async function certifiedStandards() {
  return prisma.crmStandard.findMany({
    where: { testMethod: CONTROL_TEST_METHOD },
    orderBy: { standard: "asc" },
  });
}

/** The standards that have assays in the data source, by crmKey. */
async function assayedKeys(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ k: string | null }[]>`
    SELECT DISTINCT LOWER(REGEXP_REPLACE(control, '[^A-Za-z0-9]', '')) AS k
    FROM eksplorasi_data_source
    WHERE sample_type = 'STANDARD' AND control IS NOT NULL`;
  return new Set(rows.flatMap((row) => (row.k ? [row.k] : [])));
}

/** Every assay of one standard, with its sample index, earliest first. */
function assaysOf(key: string) {
  return prisma.$queryRaw<AssayRow[]>`
    SELECT sample_id, date, ni, co, fe2o3, al2o3, cr2o3, mgo, sio2, idx
    FROM (
      SELECT sample_id, sample_type, control, date, ni, co, fe2o3, al2o3, cr2o3, mgo, sio2,
             ROW_NUMBER() OVER (ORDER BY created_at, id) AS idx
      FROM eksplorasi_data_source
    ) AS indexed
    WHERE sample_type = 'STANDARD'
      AND LOWER(REGEXP_REPLACE(control, '[^A-Za-z0-9]', '')) = ${key}
    ORDER BY idx
    LIMIT ${MAX_POINTS + 1}`;
}

/**
 * One standard's control charts, held a moment per standard asked for
 * (eksplorasi-cache.ts): any write to the data source or the CRM List
 * empties them. However the name is written, it is the same standard.
 */
export function loadStandardControl(query: Query): Promise<QcControl> {
  return controlCache.get(crmKey(query.standard ?? ""), () => computeStandardControl(query));
}

async function computeStandardControl(query: Query): Promise<QcControl> {
  const standards = await certifiedStandards();
  const names = standards.map((row) => row.standard);

  // The one asked for; otherwise -- or when it is no longer in the CRM List --
  // the first that has assays to show, so the dashboard does not open empty.
  let chosen = query.standard ? standards.find((row) => crmKey(row.standard) === crmKey(query.standard!)) : undefined;
  if (!chosen && standards.length > 0) {
    const assayed = await assayedKeys();
    chosen = standards.find((row) => assayed.has(crmKey(row.standard))) ?? standards[0];
  }

  if (!chosen) {
    return { standards: names, standard: null, testMethod: CONTROL_TEST_METHOD, elements: [], truncated: false };
  }

  const rows = await assaysOf(crmKey(chosen.standard));
  const shown = rows.slice(0, MAX_POINTS);
  const certified = chosen as unknown as Record<string, string | null>;

  const elements = CONTROL_ELEMENTS.map((element) => {
    const { points, skipped } = controlPoints(
      shown.map((row) => ({ sampleId: row.sample_id, index: Number(row.idx), date: dayOf(row.date), value: row[element] }))
    );
    return { element, limits: controlLimits(certified[element], certified[sdFieldOf(element)]), points, skipped };
  });

  return {
    standards: names,
    standard: chosen.standard,
    testMethod: CONTROL_TEST_METHOD,
    elements,
    truncated: rows.length > MAX_POINTS,
  };
}
