/**
 * The FORMULIR ANALYSIS RESULT: how the Sample Database export is arranged.
 *
 * A sheet per place and per kind of sample: the production samples of a place
 * on "MOL. Prod.", headed "<SITE> PRODUCTION SAMPLE", and each
 * non-production code on one of its own ("MOL. TP", "<SITE> TP SAMPLE") --
 * the lab reports the two apart.
 *
 * Within a sheet, samples of one batch (the same place, ore class, pit,
 * barging and running number: the Sample ID up to its sample number) sit
 * together, in sample-number order, and every batch closes with its average
 * row -- including a batch of one, so where a batch ends is never in doubt.
 * A sub-sample follows the sample it was taken from and is left out of the
 * average: it is a different fraction.
 *
 * Pure, so the arrangement can be checked without a database or a workbook.
 */

/** The document box in the form's header, as the lab's controlled copy has it. */
export const REPORT_DOCUMENT = {
  number: "FR/QAQC/LAB/00",
  revision: "00",
  effective: "1 Agustus 2017",
  reportedBy: "Laboratorium SPR",
} as const;

/** What the Sample ID's place code stands for. */
export const SITE_NAMES: Readonly<Record<string, string>> = {
  MOL: "MOLORE",
  LAM: "LAMERURU",
};

/** Stands in for the place code on a sample that has none yet. */
const FALLBACK_SITE_CODE = "LAIN";

/** A place code as the form names it: MOL is MOLORE; one it does not know, as written. */
export function siteName(code: string | null): string {
  if (!code) return "LAINNYA";
  return SITE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * A sheet tab, as the lab's own workbook names them: the place code, then
 * what the sheet holds -- "MOL. Prod." for the production samples, "MOL. TP"
 * for a non-production code.
 */
function sheetNameOf(siteCode: string, nonProd: string | null): string {
  const name = `${siteCode}. ${nonProd ?? "Prod."}`;
  // Excel refuses these in a tab name, and more than 31 characters.
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

export type ReportValue = string | number | Date | null;

export interface ReportRecord {
  id: string;
  /** The sub-sample's parent, so it can follow it. */
  parentId: string | null;
  /** The place code: MOL, LAM. */
  site: string | null;
  /**
   * The non-production code (TP, BG), or null for a production sample. A
   * sheet of its own: the lab reports the two apart.
   */
  nonProd: string | null;
  /**
   * The batch it belongs to. Records with no identity yet get one each, so
   * nothing is averaged with a stranger.
   */
  group: string;
  /** "YYYY-MM-DD"; orders the batches, earliest first. */
  shiftDate: string;
  sampleNo: number | null;
  /** The Sample ID, or the Lab Code without one; orders ties. */
  label: string;
  /** The row's values, by column key. */
  cells: Record<string, ReportValue>;
}

export interface ReportSheet {
  /** The place as the form writes it: "MOLORE". */
  site: string;
  /** The place code, which the tab is named from: "MOL". */
  siteCode: string;
  /** The non-production code this sheet holds, or null for the production one. */
  nonProd: string | null;
  /** The tab: "MOL. Prod.", "MOL. TP". */
  name: string;
  /** "MOLORE PRODUCTION SAMPLE", or "MOLORE TP SAMPLE". */
  title: string;
  /** Each batch's rows, in order. */
  batches: ReportRecord[][];
}

/** The batch key: everything in a Sample ID but its sample number and sack count. */
export function batchKey(record: {
  id: string;
  placeId: string | null;
  rockTypeId: string | null;
  nonProdId: string | null;
  sirId: string | null;
  pitId: string | null;
  bargingNo: string | null;
  sequenceNo: number | null;
}): string {
  if (!record.placeId || !record.bargingNo || record.sequenceNo === null) return `single:${record.id}`;
  return [
    record.placeId,
    record.rockTypeId,
    record.nonProdId,
    record.sirId,
    record.pitId,
    record.bargingNo.trim().toUpperCase(),
    record.sequenceNo,
  ].join("|");
}

function compareRecords(a: ReportRecord, b: ReportRecord): number {
  const byNo = (a.sampleNo ?? Number.MAX_SAFE_INTEGER) - (b.sampleNo ?? Number.MAX_SAFE_INTEGER);
  return byNo !== 0 ? byNo : a.label.localeCompare(b.label, undefined, { numeric: true });
}

export function arrangeReport(records: readonly ReportRecord[]): ReportSheet[] {
  const ids = new Set(records.map((record) => record.id));
  const subsOf = new Map<string, ReportRecord[]>();
  const tops: ReportRecord[] = [];
  for (const record of records) {
    // A sub whose parent is not in the export stands on its own.
    if (record.parentId && ids.has(record.parentId)) {
      subsOf.set(record.parentId, [...(subsOf.get(record.parentId) ?? []), record]);
    } else {
      tops.push(record);
    }
  }

  // A sheet per place and per non-production code: production samples and
  // the TP/BG ones are reported apart, as the lab's own workbook has them.
  const sheets = new Map<string, { siteCode: string; nonProd: string | null; groups: Map<string, ReportRecord[]> }>();
  for (const record of tops) {
    const siteCode = record.site?.toUpperCase() ?? FALLBACK_SITE_CODE;
    const nonProd = record.nonProd?.toUpperCase() ?? null;
    const key = `${siteCode}|${nonProd ?? ""}`;
    const sheet = sheets.get(key) ?? { siteCode, nonProd, groups: new Map<string, ReportRecord[]>() };
    sheet.groups.set(record.group, [...(sheet.groups.get(record.group) ?? []), record]);
    sheets.set(key, sheet);
  }

  const firstDay = (batch: ReportRecord[]) => batch.reduce((min, record) => (record.shiftDate < min ? record.shiftDate : min), "9999");

  // The two mines first, in a fixed order; anything else after them. Within a
  // place, the production sheet leads and the non-production codes follow.
  const rank = (siteCode: string) => {
    const known = Object.keys(SITE_NAMES).indexOf(siteCode);
    return known === -1 ? Number.MAX_SAFE_INTEGER : known;
  };

  return [...sheets.values()]
    .sort(
      (a, b) =>
        rank(a.siteCode) - rank(b.siteCode) ||
        a.siteCode.localeCompare(b.siteCode) ||
        // null (production) before any code.
        (a.nonProd === null ? -1 : b.nonProd === null ? 1 : a.nonProd.localeCompare(b.nonProd))
    )
    .map(({ siteCode, nonProd, groups }) => {
      const site = siteName(siteCode === FALLBACK_SITE_CODE ? null : siteCode);
      const batches = [...groups.values()]
        .map((batch) =>
          [...batch]
            .sort(compareRecords)
            .flatMap((record) => [record, ...(subsOf.get(record.id) ?? []).sort(compareRecords)])
        )
        .sort((a, b) => firstDay(a).localeCompare(firstDay(b)) || a[0].label.localeCompare(b[0].label, undefined, { numeric: true }));
      return {
        site,
        siteCode,
        nonProd,
        name: sheetNameOf(siteCode, nonProd),
        title: `${site} ${nonProd ?? "PRODUCTION"} SAMPLE`,
        batches,
      };
    });
}

/** The rows of a batch its average is taken over: the samples, not their sub-samples. */
export function averagedRows(batch: readonly ReportRecord[]): ReportRecord[] {
  return batch.filter((record) => !record.parentId || !batch.some((other) => other.id === record.parentId));
}

/** The mean of the numbers among the values, or null without any. */
export function mean(values: readonly ReportValue[]): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length === 0 ? null : numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}
