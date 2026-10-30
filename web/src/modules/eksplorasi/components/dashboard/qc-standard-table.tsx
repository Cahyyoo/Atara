"use client";

import { useState, type KeyboardEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { cn } from "@/core/lib/utils";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import { OUTSIDE_2SD_LIMIT, type ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { QcControl } from "@/modules/eksplorasi/types";
import {
  QcStandardRemarkDialog,
  type RemarkTarget,
} from "@/modules/eksplorasi/components/dashboard/qc-standard-remark-dialog";
import { IoCreateOutline } from "react-icons/io5";

const NUMERIC = "text-right tabular-nums";

/** The element tabs on the table's card: a segmented choice, moved through with the arrows as a tab list is. */
function ElementTabs({
  label,
  elements,
  active,
  onPick,
}: {
  label: string;
  elements: readonly ControlElement[];
  active: ControlElement;
  onPick: (element: ControlElement) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = elements.indexOf(active);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = elements[(index + step + elements.length) % elements.length];
    onPick(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-element="${next}"]`)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
      {elements.map((element) => {
        const selected = element === active;
        return (
          <button
            key={element}
            type="button"
            role="tab"
            data-element={element}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onPick(element)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {ELEMENT_LABELS[element]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The standard table, as the lab's QC workbook has it: a row per OREAS
 * standard of the CRM List -- its certified value and SD, how many assays it
 * has, their mean and range, and the share within 1, 2 and 3 SD -- and the
 * Remarks written on it. One element at a time, picked from the tabs on the
 * card (the elements shown on the dashboard), so the table stays one table.
 * Past 5% outside 2 SD, the share is marked. Remarks written here show at
 * once; the server's next answer carries them too.
 */
export function QcStandardTable({ summary }: { summary: QcControl["summary"] }) {
  const t = useTranslations("qcDashboard.control.table");
  const format = useFormatter();
  // Remarks saved since the data came, by "standard|element".
  const [written, setWritten] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<RemarkTarget | null>(null);
  // The element picked; the first shown when it is no longer among them.
  const [picked, setPicked] = useState<ControlElement | null>(null);
  const active = summary.find((entry) => entry.element === picked) ?? summary[0];

  if (!active) return null;

  const value = (number: number | null) => (number === null ? "—" : format.number(number, { maximumFractionDigits: 4 }));
  const share = (number: number | null) =>
    number === null ? "—" : format.number(number, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { element, rows } = active;
  const label = ELEMENT_LABELS[element];

  return (
    <Card className="gap-2 pb-2">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-base">{t("title", { element: label })}</CardTitle>
        {summary.length > 1 ? (
          <ElementTabs label={t("elements")} elements={summary.map((entry) => entry.element)} active={element} onPick={setPicked} />
        ) : null}
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("standard")}</TableHead>
            <TableHead className={NUMERIC}>{t("certified", { element: label })}</TableHead>
            <TableHead className={NUMERIC}>{t("n")}</TableHead>
            <TableHead className={NUMERIC}>{t("sd")}</TableHead>
            <TableHead className={NUMERIC}>{t("mean")}</TableHead>
            <TableHead className={NUMERIC}>{t("min")}</TableHead>
            <TableHead className={NUMERIC}>{t("max")}</TableHead>
            <TableHead className={NUMERIC}>{t("within1")}</TableHead>
            <TableHead className={NUMERIC}>{t("within2")}</TableHead>
            <TableHead className={NUMERIC}>{t("within3")}</TableHead>
            <TableHead className={NUMERIC}>{t("outside2")}</TableHead>
            <TableHead className="pr-4">{t("remarks")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = `${row.standard}|${element}`;
            const remarks = key in written ? written[key] : row.remarks;
            const failing = row.outside2 !== null && row.outside2 > OUTSIDE_2SD_LIMIT + 1e-9;
            return (
              <TableRow key={row.standard}>
                <TableCell className="pl-4 font-medium">{row.standard}</TableCell>
                <TableCell className={NUMERIC}>{value(row.certified)}</TableCell>
                <TableCell className={NUMERIC}>{format.number(row.n)}</TableCell>
                <TableCell className={NUMERIC}>{value(row.sd)}</TableCell>
                <TableCell className={NUMERIC}>{value(row.mean)}</TableCell>
                <TableCell className={NUMERIC}>{value(row.min)}</TableCell>
                <TableCell className={NUMERIC}>{value(row.max)}</TableCell>
                <TableCell className={NUMERIC}>{share(row.within1)}</TableCell>
                <TableCell className={NUMERIC}>{share(row.within2)}</TableCell>
                <TableCell className={NUMERIC}>{share(row.within3)}</TableCell>
                <TableCell className={cn(NUMERIC, failing && "font-medium text-destructive")}>{share(row.outside2)}</TableCell>
                <TableCell className="pr-4">
                  <div className="flex min-w-48 items-start justify-between gap-2">
                    <span className={cn("whitespace-pre-line", !remarks && "text-muted-foreground")}>{remarks || "—"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("editRemarks", { standard: row.standard, element: label })}
                      onClick={() => setEditing({ standard: row.standard, element, remarks })}
                    >
                      <IoCreateOutline aria-hidden className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {editing ? (
        <QcStandardRemarkDialog
          key={`${editing.standard}|${editing.element}`}
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setWritten((previous) => ({ ...previous, [`${saved.standard}|${saved.element}`]: saved.remarks }));
            setEditing(null);
          }}
        />
      ) : null}
    </Card>
  );
}
