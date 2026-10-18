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

/**
 * Each column's share of the page's width, so the whole sheet fits it with
 * nothing to scroll sideways; the remarks take what is left. Numbers get
 * enough for a collar coordinate, text a little more.
 */
const WIDTH: Partial<Record<DrillHoleField, string>> = {
  holeId: "10%",
  area: "10%",
  status: "9%",
  easting: "8%",
  northing: "8%",
  elevation: "6.5%",
  azimuth: "6.5%",
  dip: "5.5%",
  totalDepth: "7%",
  startDate: "8.5%",
  endDate: "8.5%",
};
const NUMBER_COLUMN_WIDTH = "4.5%";

/** Plain strings, put together once: a sheet draws hundreds of boxes at a time. */
const BOX =
  "h-8 w-full min-w-0 scroll-mt-[var(--sheet-scroll-top,0px)] rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none transition-colors placeholder:text-transparent focus:placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[selected]:bg-primary/15 data-[selected]:ring-1 data-[selected]:ring-primary/50 read-only:text-muted-foreground";
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
        // Blank, the box shows nothing until it is pointed at: an empty sheet
        // is not a column of dashes.
        className={value === "" ? `${className} text-transparent focus-visible:text-muted-foreground group-hover:text-muted-foreground` : className}
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
        className={cn(
          "pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground transition-opacity",
          value === "" && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        )}
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
      <td className="px-1.5">
        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
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
          <td key={field} className="group p-0.5">
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
    </tr>
  );
});

/**
 * The sheet: every column within the page's width and every row on the page
 * -- no scrollbar of its own either way; the page scrolls instead, with the
 * column headings held under the page's own sticky bars (`headerTop`). At
 * most a few hundred rows, so all of them are drawn.
 */
export function DrillSheetGrid({
  fields,
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
  fields: readonly DrillHoleField[];
  rows: readonly SheetRow[];
  verdictFor: (row: SheetRow) => DrillSheetVerdict | undefined;
  pending: boolean;
  saving: boolean;
  selectionFor: (row: number) => string | null;
  /** How far from the top of the window the column headings stick. */
  headerTop: number;
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

  return (
    // Clipped for the rounded corners, not scrolled: `overflow: clip` makes no
    // scroll box, so the sticky headings stick to the window. A phone is the
    // exception -- thirteen columns cannot fit one -- and scrolls sideways.
    <div className="rounded-xl border bg-background max-lg:overflow-x-auto lg:overflow-clip">
      <div {...containerProps} className="data-[dragging]:select-none">
        <table className="w-full table-fixed border-collapse text-sm max-lg:min-w-[64rem]">
          <colgroup>
            <col style={{ width: NUMBER_COLUMN_WIDTH }} />
            {fields.map((field) => (
              <col key={field} style={WIDTH[field] ? { width: WIDTH[field] } : undefined} />
            ))}
          </colgroup>
          <thead className="sticky z-20 bg-muted" style={{ top: headerTop }}>
            <tr className="h-12 border-b text-xs font-semibold text-foreground">
              <th className="px-1.5 text-left text-muted-foreground">{t("sheet.rowColumn")}</th>
              {fields.map((field) => (
                <th key={field} className="border-l border-border/60 px-1 text-center leading-tight whitespace-normal">
                  {labels[field]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
