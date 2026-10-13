/**
 * Reads a block of moisture-content weighings copied out of a spreadsheet:
 * Sample ID, Wp, W0, Wd.
 *
 * A header row is optional. With one, the columns may be in any order and
 * other columns are ignored; without one, they are read in that order. A blank
 * weight leaves the stored one as it is. Pure, so it can be checked without a
 * clipboard.
 *
 * A block copied from Excel is split on tabs. One typed by hand, or copied
 * from somewhere that turned the tabs into spaces, has no tabs: there the
 * weights are the numbers at the end of each line and the Sample ID is the
 * rest -- a Sample ID may itself be written with spaces ("MOL SAP A4/..."), so
 * splitting every space would tear it apart. Commas are never a separator:
 * "583,5" is a decimal comma.
 */
import { normaliseHeader, parseCsv } from "@/core/lib/sheets/csv-parse";
import { parseNumber } from "@/core/lib/number-parse";

export const WEIGHT_KEYS = ["wp", "w0", "wd"] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];

export interface WeightsPasteRow {
  /** 1-based position in the pasted block, as the person sees it. */
  line: number;
  key: string;
  /** Undefined: left blank, so the stored weight stays. */
  values: Partial<Record<WeightKey, number>>;
  /** Set when a cell could not be read as a weight. */
  error?: string;
}

const KEY_HEADERS = new Set(["sampleid", "sampleident", "idsampel", "sample", "labcode", "kodelab"]);
const WEIGHT_HEADERS: Record<string, WeightKey> = { wp: "wp", w0: "w0", wo: "w0", wd: "wd" };

/** The block as cells: split on tabs, or, without any, into the Sample ID and the numbers after it. */
function cellsOf(text: string): string[][] {
  if (text.includes("\t")) return parseCsv(text, "\t", true);

  return text.split(/\r?\n/).map((line) => {
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    // A header written with spaces: "Sample ID Wp W0 Wd".
    let tail = 0;
    while (tail < tokens.length && tail < WEIGHT_KEYS.length && normaliseHeader(tokens[tokens.length - 1 - tail]) in WEIGHT_HEADERS) {
      tail += 1;
    }
    if (tail === 0) {
      while (tail < tokens.length - 1 && tail < WEIGHT_KEYS.length && parseNumber(tokens[tokens.length - 1 - tail]) !== null) {
        tail += 1;
      }
    }
    const head = tokens.slice(0, tokens.length - tail).join(" ");
    return tokens.length === 0 ? [] : [head, ...tokens.slice(tokens.length - tail)];
  });
}

export function parseWeightsPaste(text: string): { rows: WeightsPasteRow[]; hasHeader: boolean } {
  const cells = cellsOf(text);
  // Without tabs a blank cannot be told from a missing column, so a line needs all three.
  const spaced = !text.includes("\t");
  const first = (cells[0] ?? []).map(normaliseHeader);
  const keyAt = first.findIndex((cell) => KEY_HEADERS.has(cell));
  const hasHeader = keyAt !== -1 || first.some((cell) => cell in WEIGHT_HEADERS);

  const columns: { key: number; weights: Partial<Record<WeightKey, number>> } = hasHeader
    ? {
        key: keyAt === -1 ? 0 : keyAt,
        weights: Object.fromEntries(
          first.flatMap((cell, index) => (cell in WEIGHT_HEADERS ? [[WEIGHT_HEADERS[cell], index]] : []))
        ),
      }
    : { key: 0, weights: { wp: 1, w0: 2, wd: 3 } };

  const rows: WeightsPasteRow[] = [];
  cells.forEach((row, index) => {
    if (hasHeader && index === 0) return;
    const key = (row[columns.key] ?? "").trim();
    if (!key && row.every((cell) => cell.trim() === "")) return;

    const values: Partial<Record<WeightKey, number>> = {};
    let error: string | undefined;
    for (const weight of WEIGHT_KEYS) {
      const at = columns.weights[weight];
      const raw = at === undefined ? "" : (row[at] ?? "").trim();
      if (raw === "") continue;
      const value = parseNumber(raw);
      if (value === null || value < 0) {
        error = `${weight.toUpperCase()} "${raw}" is not a weight.`;
        continue;
      }
      values[weight] = value;
    }
    if (spaced && !error && Object.keys(values).length < WEIGHT_KEYS.length) {
      error = "Expected the Sample ID followed by Wp, W0 and Wd.";
    }
    rows.push({ line: index + 1, key, values, ...(error ? { error } : {}) });
  });

  return { rows, hasHeader };
}
