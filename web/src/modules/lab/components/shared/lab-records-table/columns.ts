import {
  ASSAY_FIELDS,
  INSTRUMENT_FIELDS,
  type AssayField,
  type InstrumentField,
} from "@/modules/lab/lib/records/assay";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import type { LabRecordFilterValues } from "@/modules/lab/components/shared/lab-record-filters";
import { cn } from "@/core/lib/utils";

export type Column = AssayField | InstrumentField;
export const ALL_COLUMNS: Column[] = [
  ...ASSAY_FIELDS.map((field) => field.key),
  ...INSTRUMENT_FIELDS.map((field) => field.key),
];

/** The columns that can be moved and resized; Sample stays first, pinned. */
export type Movable = "shiftDate" | "status" | Column;
export const DEFAULT_ORDER: Movable[] = ["shiftDate", "status", ...ALL_COLUMNS];

/** Starting widths in pixels, until somebody drags a column wider or narrower. */
export const DEFAULT_WIDTHS: Record<string, number> = {
  sample: 220,
  shiftDate: 128,
  status: 148,
  ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, 88])),
  measurementMethod: 176,
  solutionId: 132,
  measurementFinished: 176,
};
export const TICK_WIDTH = 40;
export const CHEVRON_WIDTH = 36;

export const DEFAULT_PAGE_SIZE = "25";

/** The most a bulk change takes at once, and the most one page can hold. */
export const MATCH_LIMIT = 200;

export function formatAssay(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/** The instrument's own columns: two plain strings and one instant. */
export function formatInstrument(
  record: LabRecordListItemDTO,
  field: (typeof INSTRUMENT_FIELDS)[number]
): string {
  const value = record[field.key];
  if (value == null || value === "") return "—";
  // On the lab's clock, like everywhere else this timestamp is shown — the
  // browser's own zone would read eight hours out and say nothing.
  return field.kind === "datetime" ? (formatWitaDateTime(value) ?? "—") : String(value);
}

/** Clicks on these inside a row belong to them, not to the row. */
export function isInteractive(target: EventTarget): boolean {
  // Element, not HTMLElement: a click on an icon lands on its <svg> or
  // <path>, which are SVG elements -- and an icon button whose icon did not
  // count as the button ticked the row it sits in.
  return target instanceof Element && target.closest("input, button, a, label") !== null;
}

/** Whether any filter is away from where the page opens. */
export function isFilteredBy(filters: LabRecordFilterValues, isAssay: boolean): boolean {
  return (
    filters.search !== "" || filters.placeId !== "ALL" || filters.from !== "" || filters.to !== "" ||
    filters.results !== (isAssay ? "missing" : "all") ||
    (filters.ident ?? "all") !== "all"
  );
}

// The first two columns stay put while the results scroll sideways -- from a
// tablet up. On a phone they would cover most of the width they scroll in.
export const PIN_TICK = "left-0 z-10 w-10 bg-background sm:sticky";
// A pinned cell needs a solid background, so a ticked row's tint is laid over
// it as an image -- otherwise the two pinned cells stay white beside a
// tinted rest of the row.
export const PIN_TINT =
  "group-data-[selected=true]:bg-linear-to-r group-data-[selected=true]:from-primary/5 group-data-[selected=true]:to-primary/5";
export function pinSampleClass(canSelect: boolean): string {
  return cn("z-10 bg-background sm:sticky", canSelect ? "left-10" : "left-0");
}
