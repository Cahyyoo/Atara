/**
 * A block copied out of Excel, landing in the lab's grids the way it would land
 * in another sheet. Pure, so both grids (typing results for ticked samples, and
 * the paste sheet keyed by Sample ID) share one reading of the clipboard; the
 * clipboard itself is read, and written back, by core (clipboard-block.ts).
 */
import { readClipboardBlock, type CellWrite } from "@/core/lib/sheets/clipboard-block";
import { readHeader } from "@/modules/lab/lib/records/paste-columns";
import { parseSheetDateTime } from "@/modules/lab/lib/records/measurement-time";
import { toWitaInputValue } from "@/core/lib/wita-time";
import { INSTRUMENT_EXPORT_ORDER } from "@/modules/lab/lib/records/assay";

/** A column of a grid, by the key its box holds: "ni", "measurementFinished", "sampleIdent"... */
export type SheetKey = string;

export type { CellWrite };

export interface SpreadResult {
  writes: CellWrite[];
  /** One past the last row written to, so a growing grid knows how long to be. */
  rowsNeeded: number;
  /** Rows of the block that fell past the end of a grid of fixed length. */
  extraRows: number;
  /** Columns the block's header filled that the grid is not showing. */
  hiddenFilled: SheetKey[];
}

/** The grid a block lands in. */
export interface SpreadTarget {
  /** The columns on screen, left to right: where a block without a header goes. */
  visible: readonly SheetKey[];
  /** Every column the grid can hold, shown or not: what a header may name. */
  known: readonly SheetKey[];
  /** The box the paste started in. */
  start: { row: number; col: number };
  /** A grid of fixed length (the ticked samples); absent for one that grows. */
  rowCount?: number;
  /** The rectangle selected, when one value should fill all of it. */
  range?: { top: number; left: number; bottom: number; right: number };
  /** Dates kept as the sheet wrote them, for a grid whose date box is text. */
  rawDates?: boolean;
  /** How this grid recognises a header row; the results' own headings when absent. */
  readHeader?: (row: string[]) => { index: number; key: SheetKey }[] | null;
}

/**
 * A cell as its box holds it. A date-time box takes "YYYY-MM-DDTHH:mm", and a
 * sheet writes "3/16/2026 10:34" -- read once here, by the reader the import
 * uses, so the two cannot disagree. Anything it cannot read is left as typed,
 * and shows up as wrong where it lands.
 */
function boxValue(key: SheetKey, cell: string, rawDates = false): string {
  const value = cell.trim();
  if (rawDates || key !== "measurementFinished" || value === "") return value;
  const instant = parseSheetDateTime(value);
  return instant ? toWitaInputValue(instant) : value;
}

/** The columns a header row names, by position in the block; null when the block has none. */
function headerKeys(
  row: string[],
  known: readonly SheetKey[],
  read: (row: string[]) => { index: number; key: SheetKey }[] | null = readHeader
): (SheetKey | null)[] | null {
  const columns = read(row);
  if (!columns) return null;
  const keys: (SheetKey | null)[] = row.map(() => null);
  for (const column of columns) {
    // A Lab Code column is read as the Sample ID, as the import reads it.
    const key = column.key === "labCode" ? "sampleIdent" : column.key;
    if (known.includes(key)) keys[column.index] = key;
  }
  return keys;
}

/**
 * Where each cell of a pasted block goes.
 *
 * With a header row, columns are matched by name -- so the sheet's own order,
 * and columns the grid is not showing, do not matter -- and the data starts at
 * the row the paste was made in. Without one, the block is laid down from the
 * box it was pasted into, across the columns on screen, exactly as Excel would.
 * One value pasted over a selected rectangle fills all of it.
 *
 * An empty cell in the block leaves the box as it was: copying a block with
 * gaps is how people paste only some of a row, and a gap is not a "delete".
 */
export function spreadPaste(text: string, target: SpreadTarget): SpreadResult {
  const block = readClipboardBlock(text);
  const empty: SpreadResult = { writes: [], rowsNeeded: 0, extraRows: 0, hiddenFilled: [] };
  if (block.length === 0) return empty;

  const { visible, known, start, rowCount, range, rawDates, readHeader: read } = target;
  const fits = (row: number) => rowCount === undefined || row < rowCount;

  if (block.length === 1 && block[0].length === 1 && range) {
    const writes: CellWrite[] = [];
    for (let row = range.top; row <= range.bottom; row++) {
      for (let col = range.left; col <= range.right; col++) {
        const key = visible[col];
        if (key !== undefined && fits(row)) writes.push({ row, key, value: boxValue(key, block[0][0], rawDates) });
      }
    }
    return { writes, rowsNeeded: range.bottom + 1, extraRows: 0, hiddenFilled: [] };
  }

  const header = headerKeys(block[0], known, read);
  const data = header ? block.slice(1) : block;
  // A block copied straight out of the instrument's export opens with the
  // time it was measured, and has no header: laid down from Ni it would put a
  // date in the Ni box. Read as the export's own order instead -- the reading
  // the paste dialog has always given it (positionalColumns).
  const fromInstrument =
    !header && visible[start.col] !== "measurementFinished" && parseSheetDateTime((data[0]?.[0] ?? "").trim()) !== null;
  const keyAt = (index: number): SheetKey | null => {
    if (header) return header[index] ?? null;
    if (fromInstrument) {
      const key = INSTRUMENT_EXPORT_ORDER[index];
      return key !== undefined && known.includes(key) ? key : null;
    }
    return visible[start.col + index] ?? null;
  };

  const writes: CellWrite[] = [];
  const filled = new Set<SheetKey>();
  let extraRows = 0;
  data.forEach((cells, offset) => {
    const row = start.row + offset;
    if (!fits(row)) {
      extraRows++;
      return;
    }
    cells.forEach((cell, index) => {
      const key = keyAt(index);
      if (key === null || cell.trim() === "") return;
      writes.push({ row, key, value: boxValue(key, cell, rawDates) });
      filled.add(key);
    });
  });

  return {
    writes,
    rowsNeeded: start.row + data.length - extraRows,
    extraRows,
    hiddenFilled: [...filled].filter((key) => !visible.includes(key)),
  };
}
