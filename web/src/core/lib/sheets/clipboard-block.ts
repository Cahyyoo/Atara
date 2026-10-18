/**
 * A block copied out of Excel, landing in a grid of boxes the way it would land
 * in another sheet -- and a block of boxes going back out as something Excel
 * reads the same way. Pure, and shared by every module's grid.
 */
import { detectDelimiter, parseCsv } from "@/core/lib/sheets/csv-parse";

/** A rectangle of cells, by row and by column position on screen. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** One box to write: its row, the key of its column, and what goes in it. */
export interface CellWrite {
  row: number;
  key: string;
  value: string;
}

/** Rows as Excel puts them on the clipboard: tab-separated, the trailing newline dropped. */
export function readClipboardBlock(text: string): string[][] {
  const rows = parseCsv(text, detectDelimiter(text), true);
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === "")) rows.pop();
  return rows;
}

/** Whether a paste is a block for the grid, rather than text for the one box. */
export function isBlock(text: string): boolean {
  return /[\t\n]/.test(text.replace(/\r?\n$/, ""));
}

/** One cell as Excel reads it back: quoted only when it has to be. */
function sheetCell(value: string): string {
  // A date-time box holds "2026-03-16T10:34"; a sheet shows "2026-03-16 10:34".
  const text = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value.replace("T", " ") : value;
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A rectangle of the grid as the text Excel puts on the clipboard: tabs between
 * cells, a newline between rows. Pasted into a sheet, it lands as the same
 * block of rows and columns.
 */
export function rangeToTsv(
  range: CellRange,
  columns: readonly string[],
  valueAt: (row: number, key: string) => string
): string {
  const lines: string[] = [];
  for (let row = range.top; row <= range.bottom; row++) {
    const cells: string[] = [];
    for (let col = range.left; col <= range.right; col++) {
      const key = columns[col];
      cells.push(key === undefined ? "" : sheetCell(valueAt(row, key)));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/**
 * Where each cell of a pasted block goes, in a grid that grows to fit it.
 *
 * With a header row -- one whose cells `keyForHeader` mostly names -- columns
 * are matched by name, so the sheet's own order does not matter.
 * Without one, the block is laid down from the box it was pasted into, across
 * the columns on screen, as Excel would. One value pasted over a selected
 * rectangle fills all of it. An empty cell leaves its box as it was: a gap in
 * a copied block is not a "delete".
 */
export function spreadBlock(
  text: string,
  target: {
    columns: readonly string[];
    start: { row: number; col: number };
    range?: CellRange;
    keyForHeader?: (header: string) => string | null;
  }
): { writes: CellWrite[]; rowsNeeded: number } {
  const block = readClipboardBlock(text);
  const { columns, start, range, keyForHeader } = target;
  if (block.length === 0) return { writes: [], rowsNeeded: 0 };

  if (block.length === 1 && block[0].length === 1 && range) {
    const writes: CellWrite[] = [];
    for (let row = range.top; row <= range.bottom; row++) {
      for (let col = range.left; col <= range.right; col++) {
        const key = columns[col];
        if (key !== undefined) writes.push({ row, key, value: block[0][0].trim() });
      }
    }
    return { writes, rowsNeeded: range.bottom + 1 };
  }

  const named = keyForHeader
    ? block[0].map((cell) => {
        const key = keyForHeader(cell);
        return key !== null && columns.includes(key) ? key : null;
      })
    : null;
  // A header names most of what it holds, and at least two columns: a data row
  // can hold a word that is also a heading ("Selesai" is a status and the end
  // date's heading), but not mostly headings.
  const filled = block[0].filter((cell) => cell.trim() !== "").length;
  const hits = named?.filter((key) => key !== null).length ?? 0;
  const header = named && hits >= 2 && hits * 2 >= filled ? named : null;
  const data = header ? block.slice(1) : block;

  const writes: CellWrite[] = [];
  data.forEach((cells, offset) => {
    cells.forEach((cell, index) => {
      const key = header ? header[index] : columns[start.col + index];
      if (key === null || key === undefined || cell.trim() === "") return;
      writes.push({ row: start.row + offset, key, value: cell.trim() });
    });
  });
  return { writes, rowsNeeded: start.row + data.length };
}
