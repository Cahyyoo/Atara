/**
 * Spreadsheets write thousands separators and non-breaking spaces into numbers.
 * Shared with the import route, so a pasted block reads the same whether the
 * dialog or the server reads it.
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/\s| /g, "");
  if (!text) return null;

  // With both marks present, the last one is the decimal: "1.000,5" from an
  // Indonesian sheet and "1,000.5" from an English one are both 1000.5. It
  // used to assume the point, and read the Indonesian one as 1.0005 with
  // nothing to show for it. A comma alone is the decimal mark, which is how
  // "1,25" arrives from a sheet in an Indonesian locale.
  const comma = text.lastIndexOf(",");
  const point = text.lastIndexOf(".");
  const normalised =
    comma !== -1 && point !== -1
      ? comma > point
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "")
      : comma !== -1
        ? text.replace(",", ".")
        : text;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
