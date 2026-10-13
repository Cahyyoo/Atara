import "server-only";

import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { StreamedSheet } from "@/core/lib/sheets/export-response";

/**
 * The pieces every module's part of the backup is built from.
 *
 * The backup is the whole database as one workbook, streamed sheet by sheet.
 * Each module contributes the sheets for its own tables (BackupSection) and
 * the assembler (src/modules/backup.ts) puts them in order. This file holds
 * what they share: paging by id, the cell formats and the shape of a section.
 */

/** Rows read per query; every sheet pages with a cursor on the primary key. */
const PAGE_SIZE = 2_000;

/** One sheet in Excel holds this many rows below the header. */
export const EXCEL_MAX_ROWS = 1_048_575;

/** A time as the lab reads it, or an empty cell. */
export const when = (value: Date | null | undefined) => (value ? formatWitaDateTime(value) : null);

/** A Decimal (or anything numeric) as a plain number, or an empty cell. */
export const num = (value: unknown) => (value == null ? null : Number(value));

/** Pages through a table by id, so neither the query nor the response holds it all. */
export async function* pagedById<T extends { id: string }>(
  read: (cursor: string | undefined) => Promise<T[]>
): AsyncIterable<T> {
  let cursor: string | undefined;
  for (;;) {
    const page = await read(cursor);
    yield* page;
    if (page.length < PAGE_SIZE) return;
    cursor = page[page.length - 1].id;
  }
}

/** The findMany arguments for one page after `cursor`, in id order. */
export const idCursorArgs = (cursor: string | undefined) =>
  ({
    take: PAGE_SIZE,
    orderBy: { id: "asc" as const },
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  }) as const;

/** One module's part of the backup. */
export interface BackupSection {
  /** How many rows each of its sheets will have, by a key the backup page knows. */
  counts: () => Promise<Record<string, number>>;
  /** Its sheets, in the order they appear in the workbook. */
  sheets: () => StreamedSheet[];
  /** Lines for the About sheet: a label and the count key it reports. */
  about: readonly (readonly [label: string, countKey: string])[];
}
