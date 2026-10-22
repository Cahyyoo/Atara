import { isElementField, viewFields, type DataSourceField, type DataSourceView } from "@/modules/eksplorasi/lib/data-source-columns";

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
 * Pure, so the layout can be checked without a browser.
 */

/** A column of the list: a field, the joined depth interval, or the row's buttons. */
export type ListColumn = DataSourceField | "fromTo" | "actions";

const WEIGHT: Partial<Record<ListColumn, number>> = {
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

/** The list's columns for a view: its fields, From and To joined, then the buttons. */
export function listColumns(view: DataSourceView): ListColumn[] {
  const columns: ListColumn[] = [];
  for (const field of viewFields(view)) {
    if (field === "to" && columns.at(-1) === "fromTo") continue;
    columns.push(field === "from" ? "fromTo" : field);
  }
  return [...columns, "actions"];
}

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

/** Numbers line up on the right. */
export const isNumericColumn = (column: ListColumn) => column === "weight" || isElementField(column);
