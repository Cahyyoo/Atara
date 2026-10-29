"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/core/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { cn } from "@/core/lib/utils";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import { blankSummary } from "@/modules/eksplorasi/lib/qc-blank";
import type { QcBlank } from "@/modules/eksplorasi/types";

const NUMERIC = "text-right tabular-nums";

/**
 * The blank table, as the lab's QC workbook has it: for every element with a
 * blank limit -- whichever charts are ticked -- how many blanks, their mean
 * and range, the CRM List's Preferred Value, and how many read past it.
 */
export function QcBlankTable({ data }: { data: QcBlank }) {
  const t = useTranslations("qcDashboard.blank.table");
  const format = useFormatter();
  const value = (number: number | null) => (number === null ? "—" : format.number(number, { maximumFractionDigits: 4 }));

  return (
    <Card className="py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("element")}</TableHead>
            <TableHead className={NUMERIC}>{t("n")}</TableHead>
            <TableHead className={NUMERIC}>{t("mean")}</TableHead>
            <TableHead className={NUMERIC}>{t("limit")}</TableHead>
            <TableHead className={NUMERIC}>{t("anomalies")}</TableHead>
            <TableHead className={NUMERIC}>{t("anomalyShare")}</TableHead>
            <TableHead className={NUMERIC}>{t("min")}</TableHead>
            <TableHead className={cn(NUMERIC, "pr-4")}>{t("max")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.elements.map(({ element, points, limit }) => {
            const summary = blankSummary(points, limit);
            const failing = (summary.anomalies ?? 0) > 0;
            return (
              <TableRow key={element}>
                <TableCell className="pl-4 font-medium">{ELEMENT_LABELS[element]}</TableCell>
                <TableCell className={NUMERIC}>{format.number(summary.n)}</TableCell>
                <TableCell className={NUMERIC}>{value(summary.mean)}</TableCell>
                <TableCell className={NUMERIC}>{value(limit)}</TableCell>
                <TableCell className={cn(NUMERIC, failing && "font-medium text-destructive")}>
                  {summary.anomalies === null ? "—" : format.number(summary.anomalies)}
                </TableCell>
                <TableCell className={cn(NUMERIC, failing && "font-medium text-destructive")}>
                  {summary.anomalyShare === null
                    ? "—"
                    : format.number(summary.anomalyShare, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className={NUMERIC}>{value(summary.min)}</TableCell>
                <TableCell className={cn(NUMERIC, "pr-4")}>{value(summary.max)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
