/**
 * Minimal RFC-4180 style reader: handles quoted fields, embedded separators and
 * doubled quotes.
 *
 * The separator is a parameter because a spreadsheet writes commas to a file but
 * puts tabs on the clipboard. Everything else — quoting, separators inside
 * quotes, CRLF — is identical, so a second parser would only be a second place
 * for those to be got wrong.
 */
export function parseCsv(
  text: string,
  delimiter = ",",
  /** Keep blank lines, so a caller can number rows the way the sheet does. */
  keepBlankLines = false
): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (keepBlankLines) return rows;
  // Drop blank lines, which spreadsheets love to append.
  return rows.filter((entries) => entries.some((entry) => entry.trim() !== ""));
}

/**
 * Picks the separator a block on the clipboard uses: a tab anywhere in its
 * opening record, outside quotes, means the spreadsheet wrote it.
 *
 * A tab settles it on its own, rather than whichever separator comes first,
 * because a comma is also the decimal mark in these sheets — "1,86<tab>14,24"
 * leads with a comma and is still tab-separated. A spreadsheet never puts a
 * bare tab inside a cell on the clipboard, so its presence is decisive.
 *
 * Only pasted text goes through here; a file that was saved as CSV is read with
 * the comma the format defines.
 */
export function detectDelimiter(text: string): "\t" | "," {
  let inQuotes = false;

  for (const char of text) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === "\t") return "\t";
    if (char === "\n") break;
  }

  return ",";
}

/** "Ni (%)" and "ni" both normalise to "ni", so either header style imports. */
export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}
