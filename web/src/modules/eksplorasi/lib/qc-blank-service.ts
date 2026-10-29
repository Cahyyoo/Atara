import "server-only";
import type { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { BLANK_ELEMENTS, blankLimit, blankPoints } from "@/modules/eksplorasi/lib/qc-blank";
import { crmKey } from "@/modules/eksplorasi/lib/qc-control";
import type { qcBlankQuerySchema } from "@/modules/eksplorasi/validation";
import { blankCache } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import type { QcBlank } from "@/modules/eksplorasi/types";

/**
 * The dashboard's blank charts and table: every BLANK row of the data source
 * -- of one campaign, or of all -- in the order they came in, against the
 * CRM List's Preferred Value for a blank.
 */

/** As the other dashboard charts: past this a scatter is a smear. */
const MAX_POINTS = 5_000;

/** The CRM Blank row the lines are drawn from, by its name however written. */
const PREFERRED_VALUE = crmKey("Preferred Value");

type Query = z.output<typeof qcBlankQuerySchema>;

/**
 * The blanks of the campaign asked for, held a moment per campaign
 * (eksplorasi-cache.ts): any write to the data source or the CRM List
 * empties them.
 */
export function loadBlankCharts(query: Query): Promise<QcBlank> {
  return blankCache.get(query.campaign ?? "", () => computeBlankCharts(query));
}

async function computeBlankCharts({ campaign }: Query): Promise<QcBlank> {
  const [rows, campaigns, limits] = await Promise.all([
    prisma.dataSource.findMany({
      where: { sampleType: "BLANK", ...(campaign ? { campaign } : {}) },
      // The order they came in; the cuid breaks a tie within one createMany.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MAX_POINTS + 1,
      select: { sampleId: true, ni: true, co: true, fe2o3: true, cr2o3: true },
    }),
    prisma.dataSource.findMany({
      where: { sampleType: "BLANK", campaign: { not: null } },
      distinct: ["campaign"],
      select: { campaign: true },
      orderBy: { campaign: "asc" },
      take: 500,
    }),
    prisma.crmBlank.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  // The Preferred Value row; the first row when the lab named it otherwise.
  const preferred = limits.find((row) => crmKey(row.label) === PREFERRED_VALUE) ?? limits[0];
  const shown = rows.slice(0, MAX_POINTS);

  return {
    campaigns: campaigns.flatMap((row) => (row.campaign ? [row.campaign] : [])),
    campaign: campaign ?? null,
    elements: BLANK_ELEMENTS.map((element) => ({
      element,
      limit: blankLimit(preferred?.[element]),
      ...blankPoints(shown.map((row) => ({ sampleId: row.sampleId, value: row[element] }))),
    })),
    truncated: rows.length > MAX_POINTS,
  };
}
