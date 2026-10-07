"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportMenu } from "@/components/shared/table-toolbar";
import { useTableParams } from "@/hooks/use-table-params";
import { SubFilterSelect } from "@/components/shared/sub-filter-select";
import { SUB_FILTERS, type SubFilter } from "@/lib/validation";
import { downloadFromApi } from "@/lib/download";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/stages";
import {
  DEFAULT_RESULT_AGE_DAYS,
  EXPECTED_GAPS,
  IDENTITY_GAPS,
  RESULT_AGE_DAYS,
  type IdentityGap,
  type QualityCheck,
  type QualityList,
} from "@/lib/data-quality-checks";
import type { ApiResult } from "@/types";
import { IoChevronBack, IoChevronForward, IoReloadOutline } from "react-icons/io5";

function isGap(value: string): value is IdentityGap {
  return (IDENTITY_GAPS as readonly string[]).includes(value);
}

/**
 * The records that need a person: holes in a sample's identity, or no Ni
 * result long after it was made. Two cards say how many of each; the table
 * lists them oldest first, each a link to the sample, filtered in the URL.
 */
export function DataQualityView({ canExport }: { canExport: boolean }) {
  const t = useTranslations("dataQuality");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const tStatus = useTranslations("samples.status");
  const { get, setParams } = useTableParams();

  const check: QualityCheck = get("check", "identity") === "results" ? "results" : "identity";
  const rawGap = get("gap", "");
  const gap = isGap(rawGap) ? rawGap : null;
  const rawDays = Number(get("days", String(DEFAULT_RESULT_AGE_DAYS)));
  const days = (RESULT_AGE_DAYS as readonly number[]).includes(rawDays) ? rawDays : DEFAULT_RESULT_AGE_DAYS;
  const page = Math.max(1, Number(get("page", "1")) || 1);
  /** Results check only: the samples alone unless sub-samples are asked for. */
  const rawSubs = get("subs", "parents");
  const subs: SubFilter = (SUB_FILTERS as readonly string[]).includes(rawSubs) ? (rawSubs as SubFilter) : "parents";

  const query = new URLSearchParams({
    check,
    days: String(days),
    page: String(page),
    ...(check === "identity" && gap ? { gap } : {}),
    ...(check === "results" && subs !== "parents" ? { subs } : {}),
  }).toString();

  const [loaded, setLoaded] = useState<{ key: string; data: QualityList | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  const loadError = tCommon("loadError");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/data-quality?${query}`, { signal: controller.signal });
        const body: ApiResult<QualityList> = await response.json();
        setLoaded(
          body.success
            ? { key: query, data: body.data, error: null }
            : { key: query, data: null, error: body.error }
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoaded({ key: query, data: null, error: loadError });
      }
    })();
    return () => controller.abort();
  }, [query, loadError]);

  const data = loaded.data;
  const isLoading = loaded.key !== query;

  async function handleExport(format: "xlsx" | "csv") {
    const params = new URLSearchParams(query);
    params.delete("page");
    params.set("format", format);
    const message = await downloadFromApi(
      `/api/data-quality/export?${params.toString()}`,
      `data-quality.${format}`
    );
    if (message) toast(message, "error");
  }

  const summaryCards: { check: QualityCheck; label: string; value: number | null }[] = [
    { check: "identity", label: t("identityCard"), value: data?.summary.identity ?? null },
    { check: "results", label: t("resultsCard", { days }), value: data?.summary.results ?? null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="quality-cards" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {summaryCards.map((card) => (
          <button
            key={card.check}
            type="button"
            aria-pressed={check === card.check}
            onClick={() => setParams({ check: card.check === "identity" ? null : card.check, gap: null })}
            className={cn(
              "rounded-2xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-muted/50",
              check === card.check && "border-primary ring-2 ring-primary/20"
            )}
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p
              className={cn(
                "mt-1 text-3xl font-semibold tabular-nums",
                (card.value ?? 0) > 0 && "text-destructive"
              )}
            >
              {card.value ?? "…"}
            </p>
          </button>
        ))}
      </div>

      <div data-tour="quality-filters" className="flex flex-wrap items-center gap-2">
        {check === "identity" ? (
          <>
            <Button
              size="sm"
              variant={gap === null ? "default" : "outline"}
              onClick={() => setParams({ gap: null })}
            >
              {t("anyExpected")}
            </Button>
            {IDENTITY_GAPS.map((key) => (
              <Button
                key={key}
                size="sm"
                variant={gap === key ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setParams({ gap: key })}
              >
                {t(`gaps.${key}`)}
                {!EXPECTED_GAPS.includes(key) ? (
                  <span className="text-[10px] opacity-70">{t("optional")}</span>
                ) : null}
                <span className="tabular-nums opacity-70">{data?.summary.byGap[key] ?? ""}</span>
              </Button>
            ))}
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">{t("olderThan")}</span>
            {RESULT_AGE_DAYS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={days === value ? "default" : "outline"}
                onClick={() =>
                  setParams({ days: value === DEFAULT_RESULT_AGE_DAYS ? null : String(value) })
                }
              >
                {t("daysOption", { days: value })}
              </Button>
            ))}
            {/* Identity is a sample's own (a sub copies its parent's), so only
                the results check offers sub-samples. */}
            <div className="ml-2">
              <SubFilterSelect
                id="quality-subs"
                value={subs}
                onChange={(value) => setParams({ subs: value === "parents" ? null : value, page: null })}
              />
            </div>
          </>
        )}
        {canExport ? (
          <div className="ml-auto">
            <ExportMenu tourId="quality-export" onExport={(format) => void handleExport(format)} />
          </div>
        ) : null}
      </div>

      {loaded.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{loaded.error}</p>
      ) : null}

      <Card data-tour="quality-table">
        <CardContent className={cn("overflow-x-auto p-0", isLoading && data && "opacity-60")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.sample")}</TableHead>
                <TableHead>{t("columns.labCode")}</TableHead>
                <TableHead>{t("columns.sampleIdent")}</TableHead>
                <TableHead>{t("columns.stage")}</TableHead>
                <TableHead className="text-right">{t("columns.age")}</TableHead>
                {check === "identity" ? <TableHead>{t("columns.missing")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <IoReloadOutline className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("allGood")}
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((row) => (
                  <TableRow key={row.labCode}>
                    <TableCell>
                      <Link
                        href={`/samples/${encodeURIComponent(row.sampleCode)}`}
                        className="font-mono font-medium text-primary hover:underline"
                      >
                        {row.sampleCode}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.labCode}</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-sm">
                      {row.sampleIdent ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.stageName
                        ? stageLabel(tStages, row.stageKey, row.stageName)
                        : tStatus(row.status)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t("ageValue", { days: row.ageDays })}
                    </TableCell>
                    {check === "identity" ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.missing.map((key) => (
                            <Badge
                              key={key}
                              variant={EXPECTED_GAPS.includes(key) ? "destructive" : "outline"}
                              className="text-[10px]"
                            >
                              {t(`gaps.${key}`)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data && data.total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("pageOf", { page: data.page, pages: data.totalPages, total: data.total })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: page - 1 === 1 ? null : String(page - 1) })}
              aria-label={t("previous")}
            >
              <IoChevronBack className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setParams({ page: String(page + 1) })}
              aria-label={t("next")}
            >
              <IoChevronForward className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
