"use client";

import { memo, useMemo, type HTMLAttributes, type Ref } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { inSelection } from "@/core/hooks/use-grid-selection";
import { ELEMENT_LABELS, isElementField, SAMPLE_TYPES, type DataSourceField } from "@/modules/eksplorasi/lib/data-source-columns";
import { columnWeight, isNumericColumn, percentages } from "@/modules/eksplorasi/components/list-columns";
import { isActive, isChangedCell, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";
import { SHEET_ROW_HEIGHT } from "@/modules/eksplorasi/components/sheet/use-data-source-sheet";
import type { SampleType, SheetStatus, SheetVerdict } from "@/modules/eksplorasi/types";
import { OreasCell } from "@/modules/eksplorasi/components/sheet/oreas-cell";
import { SampleIdCell } from "@/modules/eksplorasi/components/sheet/sample-id-cell";
import { TypeCell } from "@/modules/eksplorasi/components/sheet/type-cell";
import { DateCell } from "@/modules/eksplorasi/components/sheet/date-cell";
import {
  IoAddCircle,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoLockClosedOutline,
  IoLockOpenOutline,
  IoRemoveCircleOutline,
} from "react-icons/io5";

/** The row-number column's width (list-columns.ts weights): the number, the lock and the verdict mark. */
const NUMBER_COLUMN_WEIGHT = 52;
/** Where the sheet needs more than the list: it writes dates whole, the list short -- with a calendar icon beside. */
const SHEET_WEIGHT: Partial<Record<DataSourceField, number>> = { date: 96, controlDate: 96 };

/** Plain strings, put together once: a sheet draws thousands of boxes at a time. */
const BOX =
  "h-8 w-full min-w-0 scroll-mt-[var(--sheet-scroll-top,0px)] rounded-md border border-transparent bg-transparent px-0.5 text-[11px] outline-none transition-colors placeholder:text-transparent focus:placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[selected]:bg-primary/15 data-[selected]:ring-1 data-[selected]:ring-primary/50 read-only:text-muted-foreground";
const CHANGED = " bg-amber-100/70 dark:bg-amber-500/15";
/** A box picked from a list (type, Remarks): drawn as the other boxes are, with room for its chevron. */
const PICKER = `${BOX} cursor-pointer pr-5 truncate`;

const MARKS: Record<SheetStatus, { icon: typeof IoAddCircle; className: string }> = {
  create: { icon: IoAddCircle, className: "text-primary" },
  update: { icon: IoCheckmarkCircle, className: "text-emerald-600 dark:text-emerald-400" },
  unchanged: { icon: IoRemoveCircleOutline, className: "text-muted-foreground" },
  invalid: { icon: IoCloseCircle, className: "text-destructive" },
};

function VerdictMark({ verdict, pending }: { verdict: SheetVerdict | undefined; pending: boolean }) {
  const t = useTranslations("dataSource.sheet.statuses");
  if (!verdict) {
    return pending ? <span aria-hidden className="skeleton-sheen inline-block size-3.5 rounded-full bg-muted" /> : null;
  }
  const { icon: Icon, className } = MARKS[verdict.status];
  const label = verdict.message ? `${t(verdict.status)}: ${verdict.message}` : t(verdict.status);
  return <Icon role="img" aria-label={label} title={label} className={cn("size-4 shrink-0", className)} />;
}

/** The attributes every box carries, whatever it is: how the grid finds it, and how it reads aloud. */
export interface BoxProps {
  "aria-label": string;
  "data-cell-row": number;
  "data-cell-col": number;
  "data-selected": "" | undefined;
  "aria-invalid": true | undefined;
  title: string | undefined;
}

interface RowProps {
  index: number;
  row: SheetRow;
  fields: readonly DataSourceField[];
  labels: Record<DataSourceField, string>;
  typeLabels: readonly string[];
  /** A QC list's own type, shown in every row's type box and never typed. */
  fixedTypeLabel: string | null;
  /** The OREAS names Remarks is picked from (Data Source, Standard, Blank); null where it is typed. */
  oreasChoices: readonly string[] | null;
  /** The Duplicate list: its Remarks is a FIELD sample's Sample ID, picked from a search. */
  pickSampleIds: boolean;
  verdict: SheetVerdict | undefined;
  pending: boolean;
  saving: boolean;
  selection: string | null;
  rowLabel: string;
  lockLabel: string;
  onCellChange: (row: number, key: string, value: string) => void;
  onToggleLock: (row: number) => void;
}

/** One row, memoised: typing re-renders the row being typed in, not the rest. */
const SheetGridRow = memo(function SheetGridRow(props: RowProps) {
  const { index, row, fields, labels, typeLabels, fixedTypeLabel, verdict, pending, saving, selection, rowLabel, lockLabel } =
    props;
  const existing = row.id !== undefined;
  const faultField = verdict?.status === "invalid" ? verdict.field : undefined;

  return (
    <tr
      style={{ height: SHEET_ROW_HEIGHT }}
      data-locked={row.locked ? "" : undefined}
      className={cn("border-b border-border/50", row.locked && "bg-muted/40")}
    >
      <td className="px-1">
        <span className="flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
          {index + 1}
          {existing ? (
            <button
              type="button"
              aria-label={lockLabel}
              title={lockLabel}
              aria-pressed={!row.locked}
              disabled={saving}
              onClick={() => props.onToggleLock(index)}
              className="rounded p-0.5 hover:bg-accent hover:text-foreground"
            >
              {row.locked ? <IoLockClosedOutline className="size-3.5" /> : <IoLockOpenOutline className="size-3.5 text-primary" />}
            </button>
          ) : null}
          {isActive(row) ? <VerdictMark verdict={verdict} pending={pending} /> : null}
        </span>
      </td>
      {fields.map((field, col) => {
        const faulty = faultField === field;
        const box: BoxProps = {
          "aria-label": `${rowLabel} ${labels[field]}`,
          "data-cell-row": index,
          "data-cell-col": col,
          "data-selected": inSelection(selection, col) ? "" : undefined,
          "aria-invalid": faulty ? true : undefined,
          title: faulty ? verdict?.message : row.cells[field] || undefined,
        };
        const changed = isChangedCell(row, field) && !faulty ? CHANGED : "";
        const value = row.cells[field] ?? "";
        const change = (next: string) => props.onCellChange(index, field, next);
        const numeric = isNumericColumn(field);
        return (
          <td key={field} className="group p-px">
            {field === "sampleType" && fixedTypeLabel !== null ? (
              <input {...box} readOnly tabIndex={-1} value={fixedTypeLabel} className={`${BOX} truncate`} />
            ) : field === "sampleType" && !row.locked ? (
              <div className="relative">
                <TypeCell
                  box={box}
                  value={value}
                  typeLabels={typeLabels}
                  disabled={saving}
                  className={PICKER + changed}
                  onChange={change}
                />
              </div>
            ) : field === "oreasRemarks" && props.oreasChoices && !row.locked ? (
              <div className="relative">
                <OreasCell
                  box={box}
                  value={value}
                  names={props.oreasChoices}
                  disabled={saving}
                  className={PICKER + changed}
                  onChange={change}
                />
              </div>
            ) : field === "originalSampleIdRemarks" && props.pickSampleIds && !row.locked ? (
              <div className="relative">
                <SampleIdCell
                  box={box}
                  value={value}
                  disabled={saving}
                  className={PICKER + changed}
                  onChange={change}
                />
              </div>
            ) : field === "date" || field === "controlDate" ? (
              <DateCell box={box} value={value} readOnly={row.locked || saving} className={BOX + changed} onChange={change} />
            ) : (
              <input
                {...box}
                autoComplete="off"
                inputMode={numeric ? "decimal" : undefined}
                readOnly={row.locked || saving}
                value={value}
                onChange={(event) => change(event.target.value)}
                className={(numeric ? `${BOX} text-right tabular-nums tracking-tight` : BOX) + changed}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
});

/**
 * The sheet: every column within the page's width and every row on the page
 * -- no scrollbar of its own either way; the page scrolls instead, with the
 * column headings held under the page's own sticky bars (`headerTop`). At
 * most a few hundred rows, so all of them are drawn.
 */
export function SheetGrid({
  fields,
  fixedType,
  oreasChoices = null,
  pickSampleIds = false,
  rows,
  verdictFor,
  pending,
  saving,
  selectionFor,
  headerTop,
  containerProps,
  onCellChange,
  onToggleLock,
}: {
  fields: readonly DataSourceField[];
  fixedType: SampleType | null;
  /** The OREAS names Remarks is picked from, on every list with an OREAS Remarks; null elsewhere (Duplicate). */
  oreasChoices?: readonly string[] | null;
  /** The Duplicate list: its Remarks is a FIELD sample's Sample ID, picked from a search. */
  pickSampleIds?: boolean;
  rows: readonly SheetRow[];
  verdictFor: (row: SheetRow) => SheetVerdict | undefined;
  pending: boolean;
  saving: boolean;
  selectionFor: (row: number) => string | null;
  /** How far from the top of the window the column headings stick. */
  headerTop: number;
  containerProps: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement> };
  onCellChange: (row: number, key: string, value: string) => void;
  onToggleLock: (row: number) => void;
}) {
  const t = useTranslations("dataSource");
  // Kept as one object across renders, so the memoised rows are not redrawn for it.
  const labels = useMemo(
    () =>
      Object.fromEntries(
        fields.map((field) => [field, isElementField(field) ? ELEMENT_LABELS[field] : t(`fields.${field}`)])
      ) as Record<DataSourceField, string>,
    [fields, t]
  );
  const typeLabels = useMemo(() => SAMPLE_TYPES.map((type) => t(`sampleType.${type}`)), [t]);
  const fixedTypeLabel = fixedType ? t(`sampleType.${fixedType}`) : null;
  const widths = useMemo(() => percentages([NUMBER_COLUMN_WEIGHT, ...fields.map((field) => SHEET_WEIGHT[field] ?? columnWeight(field))]), [fields]);

  return (
    // Clipped for the rounded corners, not scrolled: `overflow: clip` makes no
    // scroll box, so the sticky headings stick to the window. A phone is the
    // exception -- two dozen columns cannot fit one -- and scrolls sideways.
    <div className="rounded-xl border bg-background max-lg:overflow-x-auto lg:overflow-clip">
      <div {...containerProps} className="data-[dragging]:select-none">
        <table className="w-full table-fixed border-collapse text-xs max-lg:min-w-[64rem]">
          <colgroup>
            {widths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead className="sticky z-20 bg-muted" style={{ top: headerTop }}>
            <tr className="h-12 border-b text-[11px] font-semibold text-foreground">
              <th className="px-1 text-left text-muted-foreground">{t("sheet.rowColumn")}</th>
              {fields.map((field) => (
                <th key={field} className="border-l border-border/60 px-0.5 text-center leading-tight whitespace-normal">
                  {labels[field]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <SheetGridRow
                key={index}
                index={index}
                row={row}
                fields={fields}
                labels={labels}
                typeLabels={typeLabels}
                fixedTypeLabel={fixedTypeLabel}
                oreasChoices={oreasChoices}
                pickSampleIds={pickSampleIds}
                verdict={verdictFor(row)}
                pending={pending}
                saving={saving}
                selection={selectionFor(index)}
                rowLabel={t("sheet.row", { row: index + 1 })}
                lockLabel={row.locked ? t("sheet.unlock") : t("sheet.lock")}
                onCellChange={onCellChange}
                onToggleLock={onToggleLock}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
