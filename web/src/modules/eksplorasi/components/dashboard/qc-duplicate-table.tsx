"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/core/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { cn } from "@/core/lib/utils";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import { duplicateSummary } from "@/modules/eksplorasi/lib/qc-duplicate";
import type { QcDuplicate } from "@/modules/eksplorasi/types";

const NUMERIC = "text-right tabular-nums";

/**
 * The duplicate table, as the lab's QC workbook has it: a row per element
 * shown -- how many pairs, how many have an RPD (the points of the RPD
 * graph) and their mean RPD, and the originals' and duplicates' mean and
 * range.
 */
export function QcDuplicateTable({ elements }: { elements: QcDuplicate["elements"] }) {
  const t = useTranslations("qcDashboard.duplicate.table");
  const format = useFormatter();
  const value = (number: number | null) => (number === null ? "—" : format.number(number, { maximumFractionDigits: 4 }));

  return (
    <Card className="py-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("element")}</TableHead>
            <TableHead className={NUMERIC}>{t("nSamples")}</TableHead>
            <TableHead className={NUMERIC}>{t("rpdSamples")}</TableHead>
            <TableHead className={NUMERIC}>{t("averageRpd")}</TableHead>
            <TableHead className={NUMERIC}>{t("meanOriginal")}</TableHead>
            <TableHead className={NUMERIC}>{t("minOriginal")}</TableHead>
            <TableHead className={NUMERIC}>{t("maxOriginal")}</TableHead>
            <TableHead className={NUMERIC}>{t("meanDuplicate")}</TableHead>
            <TableHead className={NUMERIC}>{t("minDuplicate")}</TableHead>
            <TableHead className={cn(NUMERIC, "pr-4")}>{t("maxDuplicate")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {elements.map(({ element, pairs, skipped }) => {
            const summary = duplicateSummary(pairs, skipped);
            return (
              <TableRow key={element}>
                <TableCell className="pl-4 font-medium">{ELEMENT_LABELS[element]}</TableCell>
                <TableCell className={NUMERIC}>{format.number(summary.nSamples)}</TableCell>
                <TableCell className={NUMERIC}>{format.number(summary.rpdSamples)}</TableCell>
                <TableCell className={NUMERIC}>
                  {summary.averageRpd === null
                    ? "—"
                    : format.number(summary.averageRpd, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className={NUMERIC}>{value(summary.original.mean)}</TableCell>
                <TableCell className={NUMERIC}>{value(summary.original.min)}</TableCell>
                <TableCell className={NUMERIC}>{value(summary.original.max)}</TableCell>
                <TableCell className={NUMERIC}>{value(summary.duplicate.mean)}</TableCell>
                <TableCell className={NUMERIC}>{value(summary.duplicate.min)}</TableCell>
                <TableCell className={cn(NUMERIC, "pr-4")}>{value(summary.duplicate.max)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
