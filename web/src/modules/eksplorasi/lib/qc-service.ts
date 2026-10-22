import "server-only";
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { chunks } from "@/core/lib/batch";
import { dayOf, toDateColumn } from "@/modules/eksplorasi/lib/data-source";
import { duplicatePairs, standardPoints } from "@/modules/eksplorasi/lib/qc-chart";
import type { ElementField } from "@/modules/eksplorasi/lib/data-source-columns";
import type { qcChartsQuerySchema } from "@/modules/eksplorasi/validation";
import type { QcCharts } from "@/modules/eksplorasi/types";

/**
 * The dashboard's charts for one element: every STANDARD by date, every
 * DUPLICATE against its original.
 *
 * Capped: a scatter of more points than this is a smear, and the browser
 * would be drawing it on every hover. Past the cap the oldest assays are
 * shown and the chart says it was cut.
 */
const MAX_POINTS = 5_000;
/** Original sample IDs per lookup. */
const LOOKUP_CHUNK = 1_000;

type Query = z.output<typeof qcChartsQuerySchema>;

/** A row as the charts read it: who, which control, when, and the one element asked for. */
type Row = { sampleId: string; control: string | null; date: Date | null } & Partial<Record<ElementField, string | null>>;

function dateWindow(query: Query): Prisma.DataSourceWhereInput {
  if (!query.from && !query.to) return {};
  return {
    date: {
      ...(query.from ? { gte: toDateColumn(query.from) ?? undefined } : {}),
      ...(query.to ? { lte: toDateColumn(query.to) ?? undefined } : {}),
    },
  };
}

export async function loadQcCharts(query: Query): Promise<QcCharts> {
  const element = query.element;
  const dates = dateWindow(query);
  // The element's column, read by name: `element` is one of ELEMENT_FIELDS (zod).
  // Prisma cannot type a select whose key is a variable, so the row is typed here.
  const select: Prisma.DataSourceSelect = { sampleId: true, control: true, date: true, [element]: true };
  const valueOf = (row: Row) => row[element] ?? null;
  const qcRows = (sampleType: "STANDARD" | "DUPLICATE") =>
    prisma.dataSource.findMany({
      where: { sampleType, ...dates },
      select,
      orderBy: [{ date: "asc" }, { sampleId: "asc" }],
      take: MAX_POINTS + 1,
    }) as unknown as Promise<Row[]>;

  const [standards, duplicates] = await Promise.all([qcRows("STANDARD"), qcRows("DUPLICATE")]);

  const standardRows = standards.slice(0, MAX_POINTS).map((row) => ({
    sampleId: row.sampleId,
    control: row.control,
    date: dayOf(row.date),
    value: valueOf(row),
  }));
  const duplicateRows = duplicates.slice(0, MAX_POINTS).map((row) => ({
    sampleId: row.sampleId,
    control: row.control,
    value: valueOf(row),
  }));

  // The originals are looked up whatever their date: a duplicate assayed this
  // week repeats a sample that may have been assayed last month.
  const wanted = [...new Set(duplicateRows.flatMap((row) => (row.control?.trim() ? [row.control.trim()] : [])))];
  const originals = new Map<string, { sampleId: string; value: string | null }>();
  for (const ids of chunks(wanted, LOOKUP_CHUNK)) {
    const rows = (await prisma.dataSource.findMany({
      where: { sampleId: { in: ids } },
      select: { sampleId: true, [element]: true },
    })) as unknown as Row[];
    for (const row of rows) originals.set(row.sampleId.toLowerCase(), { sampleId: row.sampleId, value: valueOf(row) });
  }

  const standard = standardPoints(standardRows);
  const duplicate = duplicatePairs(duplicateRows, originals);
  return {
    element,
    standard: { ...standard, truncated: standards.length > MAX_POINTS },
    duplicate: { ...duplicate, truncated: duplicates.length > MAX_POINTS },
  };
}
