"use client";

import { memo, useMemo, type ClipboardEvent, type HTMLAttributes, type Ref } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { inSelection } from "@/core/hooks/use-grid-selection";
import { DRILL_HOLE_NUMBER_FIELDS, type DrillHoleField } from "@/modules/eksplorasi/lib/drill-hole-columns";
import { DRILL_HOLE_STATUSES } from "@/modules/eksplorasi/lib/drill-hole";
import { isActive, isChangedCell, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";
import { SHEET_ROW_HEIGHT } from "@/modules/eksplorasi/components/sheet/use-drill-sheet";
import type { DrillSheetStatus, DrillSheetVerdict } from "@/modules/eksplorasi/types";
import {
  IoAddCircle,
  IoCheckmarkCircle,
  IoChevronDown,
  IoCloseCircle,
  IoLockClosedOutline,
  IoLockOpenOutline,
  IoRemoveCircleOutline,
} from "react-icons/io5";

const isNumber = (field: DrillHoleField) => (DRILL_HOLE_NUMBER_FIELDS as readonly string[]).includes(field);

const WIDTH: Partial<Record<DrillHoleField, string>> = {
  holeId: "w-40 min-w-40",
  area: "w-40 min-w-40",
  status: "w-36 min-w-36",
  startDate: "w-32 min-w-32",
  endDate: "w-32 min-w-32",
  remarks: "w-64 min-w-64",
};
const widthOf = (field: DrillHoleField) => WIDTH[field] ?? "w-28 min-w-28";

/** Plain strings, put together once: a sheet draws hundreds of boxes at a time. */
const BOX =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus-visible:bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[selected]:bg-primary/15 data-[selected]:ring-1 data-[selected]:ring-primary/50 read-only:text-muted-foreground";
const CHANGED = " bg-amber-100/70 dark:bg-amber-500/15";
/** The status box: a select drawn as the other boxes are, with its own chevron. */
const SELECT = `${BOX} cursor-pointer appearance-none pr-6 [&>option]:bg-background [&>option]:text-foreground`;

const MARKS: Record<DrillSheetStatus, { icon: typeof IoAddCircle; className: string }> = {
  create: { icon: IoAddCircle, className: "text-primary" },
  update: { icon: IoCheckmarkCircle, className: "text-emerald-600 dark:text-emerald-400" },
  unchanged: { icon: IoRemoveCircleOutline, className: "text-muted-foreground" },
  invalid: { icon: IoCloseCircle, className: "text-destructive" },
};

function VerdictMark({ verdict, pending }: { verdict: DrillSheetVerdict | undefined; pending: boolean }) {
  const t = useTranslations("drilling.sheet.statuses");
  if (!verdict) {
    return pending ? <span aria-hidden className="skeleton-sheen inline-block size-3.5 rounded-full bg-muted" /> : null;
  }
  const { icon: Icon, className } = MARKS[verdict.status];
  const label = verdict.message ? `${t(verdict.status)}: ${verdict.message}` : t(verdict.status);
  return <Icon role="img" aria-label={label} title={label} className={cn("size-4 shrink-0", className)} />;
}

/** The attributes every box carries, whatever it is: how the grid finds it, and how it reads aloud. */
interface BoxProps {
  "aria-label": string;
  "data-cell-row": number;
  "data-cell-col": number;
  "data-selected": "" | undefined;
  "aria-invalid": true | undefined;
  title: string | undefined;
}

/**
 * The status of a row that can be changed: a list to pick from, as a sheet's
 * dropdown cell is. Blank is allowed -- a new hole is then planned, and an
 * unlocked one keeps its status. Text the list does not know (pasted, say)
 * stays visible as its own option, and is marked by the server.
 */
function StatusCell({
  box,
  value,
  statusLabels,
  disabled,
  className,
  onChange,
}: {
  box: BoxProps;
  value: string;
  statusLabels: readonly string[];
  disabled: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  // One value pasted into the box is its own to take: the grid only spreads blocks.
  const paste = (event: ClipboardEvent<HTMLSelectElement>) => {
    event.preventDefault();
    onChange(event.clipboardData.getData("text/plain").trim());
  };
  return (
    <div className="relative">
      <select
        {...box}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onPaste={paste}
        className={className}
      >
        <option value="">—</option>
        {statusLabels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
        {value && !statusLabels.includes(value) ? <option value={value}>{value}</option> : null}
      </select>
      <IoChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

interface RowProps {
  index: number;
  row: SheetRow;
  fields: readonly DrillHoleField[];
  labels: Record<DrillHoleField, string>;
  statusLabels: readonly string[];
  verdict: DrillSheetVerdict | undefined;
  pending: boolean;
  saving: boolean;
  selection: string | null;
  rowLabel: string;
  lockLabel: string;
  onCellChange: (row: number, key: string, value: string) => void;
  onToggleLock: (row: number) => void;
}

/** One row, memoised: typing re-renders the row being typed in, not the rest. */
const DrillSheetRow = memo(function DrillSheetRow(props: RowProps) {
  const { index, row, fields, labels, statusLabels, verdict, pending, saving, selection, rowLabel, lockLabel } = props;
  const existing = row.id !== undefined;
  const faultField = verdict?.status === "invalid" ? verdict.field : undefined;

  return (
    <tr
      style={{ height: SHEET_ROW_HEIGHT }}
      data-locked={row.locked ? "" : undefined}
      className={cn("border-b border-border/50", row.locked && "bg-muted/40")}
    >
      <td className={cn("sticky left-0 z-10 w-28 min-w-28 px-2", row.locked ? "bg-muted" : "bg-background")}>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
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
          title: faulty ? verdict?.message : undefined,
        };
        const changed = isChangedCell(row, field) && !faulty ? CHANGED : "";
        const value = row.cells[field] ?? "";
        const change = (next: string) => props.onCellChange(index, field, next);
        return (
          <td key={field} className={cn("p-0.5", widthOf(field))}>
            {field === "status" && !row.locked ? (
              <StatusCell
                box={box}
                value={value}
                statusLabels={statusLabels}
                disabled={saving}
                className={SELECT + changed}
                onChange={change}
              />
            ) : (
              <input
                {...box}
                autoComplete="off"
                inputMode={isNumber(field) ? "decimal" : undefined}
                placeholder={field === "startDate" || field === "endDate" ? "YYYY-MM-DD" : undefined}
                readOnly={row.locked || saving}
                value={value}
                onChange={(event) => change(event.target.value)}
                className={(isNumber(field) ? `${BOX} text-right tabular-nums` : BOX) + changed}
              />
            )}
          </td>
        );
      })}
      <td aria-hidden className="w-full" />
    </tr>
  );
});

/**
 * The sheet: a header that stays put, the row number (with the lock of an
 * existing hole and the row's verdict) that stays put, and only the rows in
 * view rendered, between two spacers.
 */
export function DrillSheetGrid({
  fields,
  rows,
  verdictFor,
  pending,
  saving,
  selectionFor,
  scrollerRef,
  onScroll,
  start,
  end,
  padTop,
  padBottom,
  containerProps,
  onCellChange,
  onToggleLock,
}: {
  fields: readonly DrillHoleField[];
  rows: readonly SheetRow[];
  verdictFor: (row: SheetRow) => DrillSheetVerdict | undefined;
  pending: boolean;
  saving: boolean;
  selectionFor: (row: number) => string | null;
  scrollerRef: Ref<HTMLDivElement>;
  onScroll: () => void;
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
  containerProps: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement> };
  onCellChange: (row: number, key: string, value: string) => void;
  onToggleLock: (row: number) => void;
}) {
  const t = useTranslations("drilling");
  // Kept as one object across renders, so the memoised rows are not redrawn for it.
  const labels = useMemo(
    () => Object.fromEntries(fields.map((field) => [field, t(`fields.${field}`)])) as Record<DrillHoleField, string>,
    [fields, t]
  );
  const statusLabels = useMemo(() => DRILL_HOLE_STATUSES.map((status) => t(`status.${status}`)), [t]);
  const span = fields.length + 2;

  return (
    <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto rounded-xl border bg-background">
      <div {...containerProps} className="w-max min-w-full data-[dragging]:select-none">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr className="h-12 border-b text-xs font-semibold text-foreground">
              <th className="sticky left-0 z-10 bg-muted px-2 text-left text-muted-foreground">{t("sheet.rowColumn")}</th>
              {fields.map((field) => (
                <th key={field} className="border-l border-border/60 px-2 text-center leading-tight whitespace-normal">
                  {labels[field]}
                </th>
              ))}
              <th aria-hidden className="w-full" />
            </tr>
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={span} />
              </tr>
            ) : null}
            {rows.slice(start, end).map((row, offset) => {
              const index = start + offset;
              return (
                <DrillSheetRow
                  key={index}
                  index={index}
                  row={row}
                  fields={fields}
                  labels={labels}
                  statusLabels={statusLabels}
                  verdict={verdictFor(row)}
                  pending={pending}
                  saving={saving}
                  selection={selectionFor(index)}
                  rowLabel={t("sheet.row", { row: index + 1 })}
                  lockLabel={row.locked ? t("sheet.unlock") : t("sheet.lock")}
                  onCellChange={onCellChange}
                  onToggleLock={onToggleLock}
                />
              );
            })}
            {padBottom > 0 ? (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={span} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
