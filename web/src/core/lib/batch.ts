/**
 * An array in slices of at most `size`, for writes and lookups done a batch
 * at a time instead of a row at a time (or all at once).
 */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}
