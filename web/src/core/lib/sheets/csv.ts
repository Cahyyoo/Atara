export function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
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
export const CSV_BOM = "\uFEFF";
