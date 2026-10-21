/**
 * A cell Excel would run rather than show: one that opens with = + - @, or
 * with a tab or carriage return.
 *
 * Exports carry text people typed -- remarks, scan notes, a user's name -- and
 * the person who opens the file is often not the person who typed it. A name
 * saved as `=HYPERLINK("http://…","Klik")` became a live formula in the super
 * admin's copy of the sign-in audit. A leading apostrophe makes Excel take the
 * cell as text (OWASP's advice for CSV injection).
 *
 * A plain number is left as it is, so a negative assay or "+5" still reads as
 * a number, and so is a lone dash standing in for "nothing".
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?\d+(?:[.,]\d+)*(?:[eE][-+]?\d+)?$/;

function neutraliseFormula(value: string): string {
  if (!FORMULA_START.test(value) || PLAIN_NUMBER.test(value) || value === "-") return value;
  return `'${value}`;
}

export function escapeCsvField(raw: string): string {
  const value = neutraliseFormula(raw);
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** One CSV line, already escaped and newline-terminated. */
export function csvLine(fields: (string | number | null)[]): string {
  return `${fields
    .map((field) => escapeCsvField(field === null ? "" : String(field)))
    .join(",")}\n`;
}

/**
 * A BOM, so Excel reads the file as UTF-8 rather than as the local codepage.
 * It belongs at the very start of the stream and nowhere else.
 */
export const CSV_BOM = "﻿";
