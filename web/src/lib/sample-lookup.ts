/**
 * The quick search (Ctrl+K): finding one sample by whatever is in hand -- the
 * barcode on the bag, the lab code on a sheet, or a piece of the Sample ID.
 *
 * Pure, so the ordering is tested without a database. The database is asked
 * for a loose set of candidates; this decides which come first.
 */

export const LOOKUP_MIN_CHARS = 2;
export const LOOKUP_MAX_CHARS = 64;
export const LOOKUP_MAX_RESULTS = 8;

/** What the box was given, cleaned; null when it is too short to search on. */
export function normalizeLookupQuery(input: string | null | undefined): string | null {
  const query = (input ?? "").trim().replace(/\s+/g, " ").slice(0, LOOKUP_MAX_CHARS);
  return query.length >= LOOKUP_MIN_CHARS ? query : null;
}

export interface LookupCandidate {
  sampleCode: string;
  labCode: string | null;
  sampleIdent: string | null;
}

/**
 * How well a candidate answers the query: an exact barcode first (a scanner
 * types the whole thing), then an exact lab code, then an exact Sample ID,
 * then anything that starts with the query, then anything that contains it.
 * Case is ignored, as the database's collation ignores it.
 */
function score(query: string, row: LookupCandidate): number {
  const q = query.toLowerCase();
  const fields = [row.sampleCode, row.labCode, row.sampleIdent].map(
    (value) => value?.toLowerCase() ?? null
  );

  for (const [index, value] of fields.entries()) {
    if (value === q) return index;
  }
  if (fields.some((value) => value?.startsWith(q))) return 10;
  if (fields.some((value) => value?.includes(q))) return 20;
  return 30;
}

/** The candidates in the order to show them: best first, each once, at most eight. */
export function rankLookupMatches<T extends LookupCandidate>(query: string, rows: T[]): T[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => (seen.has(row.sampleCode) ? false : (seen.add(row.sampleCode), true)))
    .map((row) => ({ row, score: score(query, row) }))
    .sort((a, b) => a.score - b.score || a.row.sampleCode.localeCompare(b.row.sampleCode))
    .slice(0, LOOKUP_MAX_RESULTS)
    .map(({ row }) => row);
}

/** True when the top result is an exact hit on any of its three codes. */
export function isExactMatch(query: string, row: LookupCandidate): boolean {
  return score(query, row) < 10;
}
