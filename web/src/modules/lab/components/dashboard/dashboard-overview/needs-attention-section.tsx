"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/core/components/ui/table";
import type { AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { samplePath } from "@/modules/lab/lib/samples/sample-ident";
import { IoReorderFourOutline, IoWarningOutline } from "react-icons/io5";

interface NeedsAttentionSectionProps {
  data: AnalyticsResult;
  showTable: boolean;
  onToggleTable: () => void;
}

/**
 * The samples past their stage SLA, and the throughput behind the charts as a
 * table for those who would rather read the numbers.
 */
export function NeedsAttentionSection({ data, showTable, onToggleTable }: NeedsAttentionSectionProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const tSamples = useTranslations("samples");
  const tDatabase = useTranslations("database");

  return (
    <>
      <Card id="needs-attention" data-tour="dashboard-attention" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {data.overdueSamples.length > 0 ? (
              <IoWarningOutline className="size-4 text-destructive" />
            ) : null}
            {t("needsAttention.title", { count: data.overdueSamples.length })}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onToggleTable}
          >
            <IoReorderFourOutline className="size-4" />
            {showTable ? t("needsAttention.hideTable") : t("needsAttention.showTable")}
          </Button>
        </CardHeader>
        <CardContent>
          {data.overdueSamples.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("needsAttention.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tSamples("barcodeCode")}</TableHead>
                    <TableHead>{tSamples("labCode")}</TableHead>
                    {/* Which sample, not just which barcode: this is the
                        table for chasing specific ones down. */}
                    <TableHead>{tDatabase("sampleIdent")}</TableHead>
                    <TableHead>{t("needsAttention.stuckIn")}</TableHead>
                    <TableHead className="text-right">{t("needsAttention.hours")}</TableHead>
                    <TableHead className="text-right">{t("needsAttention.sla")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.overdueSamples.slice(0, 20).map((sample) => (
                    <TableRow key={sample.sampleCode}>
                      <TableCell className="font-medium">
                        <Link
                          href={samplePath(sample.sampleCode)}
                          className="text-primary hover:underline"
                        >
                          {sample.sampleCode}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {sample.labCode ?? tCommon("empty")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {sample.sampleIdent ?? (
                          <span className="font-sans text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {stageLabel(tStages, sample.stageKey, sample.stageName)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-destructive">
                        {sample.hoursInStage}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {sample.slaHours}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showTable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("chartData.title")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("chartData.shiftDay")}</TableHead>
                  <TableHead className="text-right">{t("throughput.registered")}</TableHead>
                  <TableHead className="text-right">{t("throughput.completed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.throughput.map((row) => (
                  <TableRow key={row.shiftDate}>
                    <TableCell>{row.shiftDate}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.created}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.completed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
