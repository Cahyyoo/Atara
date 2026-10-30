import "server-only";
import { prisma } from "@/core/lib/prisma";
import { ApiError } from "@/core/lib/http/api-response";
import { chunks } from "@/core/lib/batch";
import type { DataSourceImportRow, ImportError } from "@/modules/eksplorasi/lib/data-source-import";

/** A row as read from a sheet or a file: only what the rule looks at. */
type NamedRow = { line: number; data: Pick<DataSourceImportRow, "sampleId" | "sampleType" | "originalSampleIdRemarks"> };

/**
 * A duplicate's Remarks names its original: the Sample ID of a FIELD sample.
 * The Duplicate list's sheet picks it from a dropdown, but a paste, an
 * imported file or the API can write anything there -- another column's
 * value, pasted one box over, or a note. Every way in is held to it here, so
 * the dashboard's pairs stay whole. Matched as the dashboard pairs them: the
 * Sample ID, case aside.
 */

/** As findExistingSamples (data-source-upsert.ts): a handful of lookups for a 34,000-row file. */
const LOOKUP_CHUNK = 1_000;

const keyOf = (sampleId: string) => sampleId.trim().toLowerCase();

const messageFor = (remarks: string) => `Remarks must be the Sample ID of a FIELD sample ("${remarks}" is not one).`;

/** The FIELD samples among these Sample IDs, by keyOf. */
async function fieldSamples(sampleIds: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const ids of chunks([...new Set(sampleIds)], LOOKUP_CHUNK)) {
    const rows = await prisma.dataSource.findMany({
      where: { sampleType: "FIELD", sampleId: { in: ids } },
      select: { sampleId: true },
    });
    for (const row of rows) found.add(keyOf(row.sampleId));
  }
  return found;
}

/**
 * The rows whose Remarks names no FIELD sample, as errors on that column. A
 * FIELD sample arriving in the same batch counts: a file may bring a field
 * sample and its duplicate together.
 */
export async function unknownOriginals(rows: readonly NamedRow[]): Promise<ImportError[]> {
  const named = rows.filter((row) => row.data.originalSampleIdRemarks);
  if (named.length === 0) return [];

  const known = await fieldSamples(named.map((row) => row.data.originalSampleIdRemarks!.trim()));
  for (const row of rows) if (row.data.sampleType === "FIELD") known.add(keyOf(row.data.sampleId));

  return named.flatMap((row) => {
    const remarks = row.data.originalSampleIdRemarks!;
    return known.has(keyOf(remarks))
      ? []
      : [{ line: row.line, sampleId: row.data.sampleId, field: "originalSampleIdRemarks" as const, message: messageFor(remarks) }];
  });
}

/** The same rule for one row written through the API: a 422 naming the column. */
export async function assertKnownOriginal(data: Pick<DataSourceImportRow, "originalSampleIdRemarks">): Promise<void> {
  const remarks = data.originalSampleIdRemarks?.trim();
  if (!remarks) return;
  if ((await fieldSamples([remarks])).has(keyOf(remarks))) return;
  throw new ApiError(messageFor(remarks), 422, "unknown-original", { field: "originalSampleIdRemarks" });
}
