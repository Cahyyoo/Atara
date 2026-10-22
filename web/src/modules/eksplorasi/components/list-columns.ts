import { normalizeOrder } from "@/core/lib/ui/column-layout";
import {
  DATA_SOURCE_VIEWS,
  ELEMENT_FIELDS,
  isElementField,
  viewFields,
  type DataSourceField,
  type DataSourceView,
} from "@/modules/eksplorasi/lib/data-source-columns";

/**
 * A list's columns on screen, and how wide each is -- so up to twenty-six
 * columns share the page's width with nothing to scroll sideways.
 *
 * Widths are weights in pixels at the page's widest (about 1,230px), turned
 * into percentages of the table. Measured in a browser: an element needs 43
 * to show "12.345" whole at 11px, so the elements get that and the text
 * columns share what is left -- they wrap onto a second line rather than lose
 * their end. From and To share one column on the data source, as the lab's
 * sheet writes them ("12.0–13.0").
 *
 * Which columns show and in what order is up to whoever reads the list
 * (arrangeColumns); the shares are worked out from the columns shown, so a
 * hidden column gives its room to the others.
 *
 * Pure, so the layout can be checked without a browser.
 */

/**
 * A column of the list: the row's running number, a field, the joined depth
 * interval, or the row's buttons.
 */
export type ListColumn = "rowNo" | DataSourceField | "fromTo" | "actions";

/** Columns that stay where they are: the number first, the buttons last. */
const FIXED: readonly ListColumn[] = ["rowNo", "actions"];

const WEIGHT: Partial<Record<ListColumn, number>> = {
  /** Up to four digits, "1250". */
  rowNo: 30,
  controlDate: 54,
  control: 56,
  campaign: 56,
  no: 26,
  holeId: 54,
  sampleId: 68,
  sampleType: 52,
  from: 44,
  to: 44,
  fromTo: 64,
  remarks: 54,
  date: 54,
  weight: 42,
  /** Edit above delete: the rows are two lines tall anyway. */
  actions: 28,
};
/** An element's share, and anything not listed. */
const UNIT = 43;

/** The list's columns for a view: the number, its fields, From and To joined, then the buttons. */
export function listColumns(view: DataSourceView): ListColumn[] {
  const columns: ListColumn[] = [];
  for (const field of viewFields(view)) {
    if (field === "to" && columns.at(-1) === "fromTo") continue;
    columns.push(field === "from" ? "fromTo" : field);
  }
  return ["rowNo", ...columns, "actions"];
}

/**
 * The columns somebody can move and hide on each list: all but the number
 * and the buttons, which stay first and last. One array per view, built once, so the hooks that remember
 * the choice get the same defaults on every render.
 */
export const ARRANGEABLE: Record<DataSourceView, ListColumn[]> = Object.fromEntries(
  DATA_SOURCE_VIEWS.map((view) => [view, listColumns(view).filter((column) => !FIXED.includes(column))])
) as Record<DataSourceView, ListColumn[]>;

/**
 * The assay results, Ni to MC: hidden until somebody ticks them. A list opens
 * on who and where each sample is, readable at a comfortable size; a row's
 * detail panel has all sixteen values.
 */
export const HIDDEN_BY_DEFAULT: readonly ListColumn[] = ELEMENT_FIELDS;

/** The columns ticked on a first visit, and after Reset layout. One array per view, built once. */
export const DEFAULT_VISIBLE: Record<DataSourceView, ListColumn[]> = Object.fromEntries(
  DATA_SOURCE_VIEWS.map((view) => [view, ARRANGEABLE[view].filter((column) => !HIDDEN_BY_DEFAULT.includes(column))])
) as Record<DataSourceView, ListColumn[]>;

/** Always shown: a row without its sample ID cannot be told apart. It still moves. */
export const LOCKED_COLUMNS: readonly ListColumn[] = ["sampleId"];

/**
 * The columns a list shows: in the order somebody dragged them into (columns
 * that order does not know go back to their usual place), only those ticked
 * plus the locked ones, between the number and the buttons.
 */
export function arrangeColumns(view: DataSourceView, order: readonly string[], visible: readonly string[]): ListColumn[] {
  const shown = (normalizeOrder(order, ARRANGEABLE[view]) as ListColumn[]).filter(
    (column) => LOCKED_COLUMNS.includes(column) || visible.includes(column)
  );
  return ["rowNo", ...shown, "actions"];
}

/** A list's columns on a first visit: the usual order, the assay results hidden. */
export const defaultColumns = (view: DataSourceView) => arrangeColumns(view, [], DEFAULT_VISIBLE[view]);

/** A column's share before it is turned into a percentage. */
export const columnWeight = (column: ListColumn) => WEIGHT[column] ?? UNIT;

/** Weights as percentages of the table, adding up to 100. */
export function percentages(weights: readonly number[]): string[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => `${((weight / total) * 100).toFixed(3)}%`);
}

/** Each column's width as a percentage of the table, adding up to 100. */
export function columnWidths(columns: readonly ListColumn[]): string[] {
  return percentages(columns.map(columnWeight));
}

/**
 * More columns than fit at a comfortable size: the table drops to 11px with
 * narrow padding so it still needs no sideways scrolling. Every list fits
 * comfortably with its default columns and a few elements ticked on.
 */
export const COMFORTABLE_MAX = 16;
export const isCompact = (columns: readonly ListColumn[]) => columns.length > COMFORTABLE_MAX;

const CENTERED: readonly ListColumn[] = ["rowNo", "sampleType", "date", "controlDate", "no", "actions"];

/** Short marks and dates in the middle, numbers on the right, words on the left -- heading and cells alike. */
export function alignOf(column: ListColumn): "left" | "center" | "right" {
  if (CENTERED.includes(column)) return "center";
  return isNumericColumn(column) ? "right" : "left";
}

/** Numbers line up on the right. */
export const isNumericColumn = (column: ListColumn) =>
  column === "rowNo" || column === "weight" || isElementField(column);
