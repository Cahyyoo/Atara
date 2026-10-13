import { ApiError } from "@/core/lib/http/api-response";
import { EXPORT_ROW_LIMIT } from "@/core/lib/sheets/export-response";
import type { SheetRow } from "@/core/lib/sheets/xlsx";

/**
 * What every export checks and does before and while it streams.
 */

/**
 * Refuses an export over EXPORT_ROW_LIMIT. Called before a single byte is
 * written: once the stream opens, the status is already sent and can no
 * longer become a 413.
 */
export function assertExportSize(total: number): void {
  if (total > EXPORT_ROW_LIMIT) {
    throw new ApiError(
      `This export would contain ${total} rows. Narrow the filters to at most ${EXPORT_ROW_LIMIT}.`,
      413
    );
  }
}

/**
 * Pages through a query by a unique key, so neither the query nor the
 * response ever holds everything: `fetchPage(cursor)` reads the page after
 * `cursor` (undefined for the first), `toRow` turns each record into a sheet
 * row, and `keyOf` gives the cursor of the last one.
 */
export async function* cursorRows<T>(
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
  keyOf: (row: T) => string,
  toRow: (row: T) => SheetRow,
  pageSize: number
): AsyncIterable<SheetRow> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const row of page) yield toRow(row);
    if (page.length < pageSize) return;
    cursor = keyOf(page[page.length - 1]);
  }
}
