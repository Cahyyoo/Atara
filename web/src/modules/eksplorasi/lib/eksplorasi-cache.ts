import "server-only";
import { TtlCache } from "@/core/lib/ttl-cache";
import type { OreasStandard } from "@/modules/eksplorasi/lib/oreas-match";
import type { CrmRowDTO, QcBlank, QcControl, QcDuplicate } from "@/modules/eksplorasi/types";

/**
 * What the Eksplorasi module reads again and again, held for half a minute:
 * the CRM List (every sheet save and import reads its OREAS values, every
 * sheet opened reads the standards), the campaigns behind the lists' filter,
 * and the dashboard's charts -- one GROUP-free scan of the data source each.
 *
 * Every write empties what it touches the moment it lands (the services call
 * the two functions below), so nobody sees the data from before their own
 * save. The thirty seconds only bound what this process cannot hear about:
 * another instance's writes, a seed, SQL typed by hand.
 *
 * What is held is shared by every caller: it is read, never changed.
 * The data source's own pages and the Sample ID search are not held -- they
 * depend on what is typed and must always be current.
 */

export const EKSPLORASI_CACHE_TTL_MS = 30_000;

/** Keyed by the CRM table: standard, blank, duplicate. */
export const crmListCache = new TtlCache<CrmRowDTO[]>(EKSPLORASI_CACHE_TTL_MS, 3);
export const oreasStandardsCache = new TtlCache<OreasStandard[]>(EKSPLORASI_CACHE_TTL_MS, 1);
export const campaignsCache = new TtlCache<string[]>(EKSPLORASI_CACHE_TTL_MS, 1);
/** Keyed by "standard|campaign" (the standard by crmKey), "" for the standard the dashboard opens on or every campaign. */
export const controlCache = new TtlCache<QcControl>(EKSPLORASI_CACHE_TTL_MS, 64);
/** Keyed by "campaign|month", "" for every campaign or month. */
export const duplicatesCache = new TtlCache<QcDuplicate>(EKSPLORASI_CACHE_TTL_MS, 64);
/** Keyed by the campaign asked for, "" for every campaign. */
export const blankCache = new TtlCache<QcBlank>(EKSPLORASI_CACHE_TTL_MS, 64);

/** After any write to the data source: its campaigns and every dashboard chart. */
export function invalidateDataSourceCaches(): void {
  campaignsCache.invalidate();
  controlCache.invalidate();
  blankCache.invalidate();
  duplicatesCache.invalidate();
}

/** After any write to the CRM List: its tables, the OREAS values, and the control and blank charts' lines. */
export function invalidateCrmCaches(): void {
  crmListCache.invalidate();
  oreasStandardsCache.invalidate();
  controlCache.invalidate();
  blankCache.invalidate();
}

/** After the Remarks of the standard table are written: they come with the control charts. */
export function invalidateStandardRemarkCaches(): void {
  controlCache.invalidate();
}

/** Test seam: a test that writes straight through Prisma starts from nothing held. */
export function resetEksplorasiCaches(): void {
  invalidateDataSourceCaches();
  invalidateCrmCaches();
}
