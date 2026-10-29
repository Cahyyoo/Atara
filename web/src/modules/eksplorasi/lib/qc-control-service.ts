import "server-only";
import type { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { dayOf } from "@/modules/eksplorasi/lib/data-source";
import {
  CONTROL_ELEMENTS,
  CONTROL_TEST_METHOD,
  chartValue,
  controlLimits,
  controlPoints,
  crmKey,
  sdFieldOf,
  standardFigures,
  type ControlElement,
} from "@/modules/eksplorasi/lib/qc-control";
import type { qcControlQuerySchema } from "@/modules/eksplorasi/validation";
import { controlCache, invalidateStandardRemarkCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import type { QcControl } from "@/modules/eksplorasi/types";

/**
 * The dashboard's control charts for one OREAS standard: its assays from the
 * data source, against its certified values and SDs from the CRM List (the
 * Fusion XRF row) -- and the standard table above them, every standard's
 * assays against its own. Both for one campaign, or for all.
 *
 * The sample index is the row's place in the whole data source, in the order
 * the rows came in (created_at, then the cuid, which Prisma hands out in
 * sequence even within one createMany). It is counted over every row --
 * field samples, blanks, duplicates, every campaign -- so a standard sits
 * where the lab's sheet has it, whichever campaign is shown.
 */

/** As the other dashboard charts: past this a scatter is a smear. */
const MAX_POINTS = 5_000;

type Query = z.output<typeof qcControlQuerySchema>;

type AssayRow = { sample_id: string; date: Date | null; idx: bigint } & Record<ControlElement, string | null>;

/** A standard's assays, by its crmKey, for the standard table. */
type StandardAssay = { k: string } & Record<ControlElement, string | null>;

type CertifiedRow = Awaited<ReturnType<typeof certifiedStandards>>[number];

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

/** Every assay of one standard -- of one campaign, or of all -- with its sample index, earliest first. */
function assaysOf(key: string, campaign: string | null) {
  return prisma.$queryRaw<AssayRow[]>`
    SELECT sample_id, date, ni, co, fe2o3, al2o3, cr2o3, mgo, sio2, idx
    FROM (
      SELECT sample_id, sample_type, control, campaign, date, ni, co, fe2o3, al2o3, cr2o3, mgo, sio2,
             ROW_NUMBER() OVER (ORDER BY created_at, id) AS idx
      FROM eksplorasi_data_source
    ) AS indexed
    WHERE sample_type = 'STANDARD'
      AND LOWER(REGEXP_REPLACE(control, '[^A-Za-z0-9]', '')) = ${key}
      AND (${campaign} IS NULL OR campaign = ${campaign})
    ORDER BY idx
    LIMIT ${MAX_POINTS + 1}`;
}

/** Every standard's assays of the campaign (or all), grouped by crmKey. */
async function assaysByStandard(campaign: string | null): Promise<Map<string, StandardAssay[]>> {
  const rows = await prisma.$queryRaw<StandardAssay[]>`
    SELECT LOWER(REGEXP_REPLACE(control, '[^A-Za-z0-9]', '')) AS k, ni, co, fe2o3, al2o3, cr2o3, mgo, sio2
    FROM eksplorasi_data_source
    WHERE sample_type = 'STANDARD' AND control IS NOT NULL
      AND (${campaign} IS NULL OR campaign = ${campaign})`;
  const byKey = new Map<string, StandardAssay[]>();
  for (const row of rows) {
    const group = byKey.get(row.k);
    if (group) group.push(row);
    else byKey.set(row.k, [row]);
  }
  return byKey;
}

/** The campaigns that have standards, for the "Campaign Criteria" choice. */
async function standardCampaigns(): Promise<string[]> {
  const rows = await prisma.dataSource.findMany({
    where: { sampleType: "STANDARD", campaign: { not: null } },
    distinct: ["campaign"],
    select: { campaign: true },
    orderBy: { campaign: "asc" },
    take: 500,
  });
  return rows.flatMap((row) => (row.campaign ? [row.campaign] : []));
}

/** The Remarks written on the standard table, by "crmKey|element". */
async function standardRemarks(): Promise<Map<string, string>> {
  const rows = await prisma.qcStandardRemark.findMany({ select: { standardKey: true, element: true, remarks: true } });
  return new Map(rows.map((row) => [`${row.standardKey}|${row.element}`, row.remarks]));
}

/** The standard table: per element, a row for every standard the CRM List certifies, in its order. */
function standardSummary(
  standards: readonly CertifiedRow[],
  assays: Map<string, StandardAssay[]>,
  remarks: Map<string, string>
): QcControl["summary"] {
  return CONTROL_ELEMENTS.map((element) => ({
    element,
    rows: standards.map((row) => {
      const key = crmKey(row.standard);
      const certified = row as unknown as Record<string, string | null>;
      const value = certified[element];
      const sd = certified[sdFieldOf(element)];
      return {
        standard: row.standard,
        certified: chartValue(value),
        sd: chartValue(sd),
        ...standardFigures((assays.get(key) ?? []).map((assay) => assay[element]), controlLimits(value, sd)),
        remarks: remarks.get(`${key}|${element}`) ?? null,
      };
    }),
  }));
}

/**
 * One standard's control charts and the standard table, held a moment per
 * standard and campaign asked for (eksplorasi-cache.ts): any write to the
 * data source, the CRM List or the Remarks empties them. However the name is
 * written, it is the same standard.
 */
export function loadStandardControl(query: Query): Promise<QcControl> {
  return controlCache.get(`${crmKey(query.standard ?? "")}|${query.campaign ?? ""}`, () => computeStandardControl(query));
}

async function computeStandardControl(query: Query): Promise<QcControl> {
  const campaign = query.campaign ?? null;
  const [standards, campaigns, assays, remarks] = await Promise.all([
    certifiedStandards(),
    standardCampaigns(),
    assaysByStandard(campaign),
    standardRemarks(),
  ]);
  const base = {
    standards: standards.map((row) => row.standard),
    campaigns,
    campaign,
    testMethod: CONTROL_TEST_METHOD,
    summary: standardSummary(standards, assays, remarks),
  };

  // The one asked for; otherwise -- or when it is no longer in the CRM List --
  // the first that has assays to show, so the dashboard does not open empty.
  let chosen = query.standard ? standards.find((row) => crmKey(row.standard) === crmKey(query.standard!)) : undefined;
  if (!chosen && standards.length > 0) {
    const assayed = await assayedKeys();
    chosen = standards.find((row) => assayed.has(crmKey(row.standard))) ?? standards[0];
  }

  if (!chosen) return { ...base, standard: null, elements: [], truncated: false };

  const rows = await assaysOf(crmKey(chosen.standard), campaign);
  const shown = rows.slice(0, MAX_POINTS);
  const certified = chosen as unknown as Record<string, string | null>;

  const elements = CONTROL_ELEMENTS.map((element) => {
    const { points, skipped } = controlPoints(
      shown.map((row) => ({ sampleId: row.sample_id, index: Number(row.idx), date: dayOf(row.date), value: row[element] }))
    );
    return { element, limits: controlLimits(certified[element], certified[sdFieldOf(element)]), points, skipped };
  });

  return { ...base, standard: chosen.standard, elements, truncated: rows.length > MAX_POINTS };
}

/**
 * Writes the Remarks on one standard and element of the standard table, or
 * removes them when empty. Held by the standard's crmKey, so the note
 * follows the standard however its name is written.
 */
export async function saveStandardRemark(
  input: { standard: string; element: ControlElement; remarks: string },
  userId: string
): Promise<{ standard: string; element: ControlElement; remarks: string | null }> {
  const standardKey = crmKey(input.standard);
  const remarks = input.remarks.trim();
  if (remarks === "") {
    await prisma.qcStandardRemark.deleteMany({ where: { standardKey, element: input.element } });
  } else {
    await prisma.qcStandardRemark.upsert({
      where: { standardKey_element: { standardKey, element: input.element } },
      create: { standardKey, element: input.element, remarks, updatedById: userId },
      update: { remarks, updatedById: userId },
    });
  }
  invalidateStandardRemarkCaches();
  return { standard: input.standard, element: input.element, remarks: remarks || null };
}
