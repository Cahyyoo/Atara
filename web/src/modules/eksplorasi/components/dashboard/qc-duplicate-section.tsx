"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { DuplicateOverview } from "@/modules/eksplorasi/lib/qc-overview";
import type { QcDuplicate } from "@/modules/eksplorasi/types";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcDuplicateTable } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-table";
import { QcKpiCards } from "@/modules/eksplorasi/components/dashboard/qc-kpi-cards";
import {
  ALL,
  CriteriaLoading,
  CriteriaSelect,
  criteriaQuery,
  useCriteriaData,
} from "@/modules/eksplorasi/components/dashboard/qc-criteria";
import { IoCopyOutline, IoGitCompareOutline, IoSpeedometerOutline, IoTrendingUpOutline } from "react-icons/io5";

/** The chart library in its own chunk, as for the control charts. */
const QcDuplicateCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-duplicate-charts").then((m) => m.QcDuplicateCharts),
  { ssr: false, loading: () => <ControlChartsSkeleton /> }
);

/** The CRM List's preferred value for a duplicate's fit, and the share of pairs it wants within 10% RPD. */
const R2_PREFERRED = 0.9;
const WITHIN_PREFERRED = 0.9;

/** The duplicates' choices of campaign and month, and the data they ask for -- kept by the dashboard. */
export function useDuplicateCriteria(initial: QcDuplicate) {
  const [campaign, setCampaign] = useState(initial.campaign ?? ALL);
  const [month, setMonth] = useState(initial.month ?? ALL);
  const answer = useCriteriaData(
    "/api/data-sources/qc/duplicates",
    criteriaQuery({ campaign, month }),
    initial,
    criteriaQuery({ campaign: initial.campaign ?? ALL, month: initial.month ?? ALL })
  );
  return { initial, campaign, setCampaign, month, setMonth, ...answer };
}

/**
 * The dashboard's duplicates, for one campaign and one month of their date
 * or all: the summary cards, the duplicate table, then every duplicate
 * against the original its Remarks names, for the chosen `elements`.
 */
export function QcDuplicateSection({
  criteria,
  overview,
  elements,
}: {
  criteria: ReturnType<typeof useDuplicateCriteria>;
  overview: DuplicateOverview;
  elements: readonly ControlElement[];
}) {
  const t = useTranslations("qcDashboard");
  const format = useFormatter();
  const { data, loading, error, initial } = criteria;
  const shown = data.elements.filter(({ element }) => elements.includes(element));
  const count = (value: number) => format.number(Math.round(value));
  const percent = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 1 });
  const decimal = (value: number) => format.number(value, { maximumFractionDigits: 4 });
  const monthLabel = (value: string) =>
    format.dateTime(new Date(`${value}-01T00:00:00Z`), { month: "short", year: "numeric", timeZone: "UTC" });
  const { lowestR2, withinRpd } = overview;

  return (
    <section aria-labelledby="qc-duplicate-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="qc-duplicate-heading" className="text-lg font-semibold tracking-tight">
            {t("duplicate.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("duplicate.description")}</p>
          {data.unmatched > 0 ? (
            <p className="pt-1 text-xs text-muted-foreground">{t("duplicate.unmatched", { count: data.unmatched })}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {loading ? <CriteriaLoading /> : null}
          <CriteriaSelect
            id="qc-duplicate-campaign"
            label={t("criteria.campaign")}
            value={criteria.campaign}
            onChange={criteria.setCampaign}
            options={[
              { value: ALL, label: t("criteria.allCampaigns") },
              ...initial.campaigns.map((name) => ({ value: name, label: name })),
            ]}
          />
          <CriteriaSelect
            id="qc-duplicate-month"
            label={t("criteria.month")}
            value={criteria.month}
            onChange={criteria.setMonth}
            options={[
              { value: ALL, label: t("criteria.allMonths") },
              ...initial.months.map((value) => ({ value, label: monthLabel(value) })),
            ]}
          />
        </div>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <QcKpiCards
        label={t("kpi.label", { section: t("duplicate.title") })}
        items={[
          { label: t("kpi.duplicate.pairs"), value: overview.pairs, format: count, icon: IoCopyOutline },
          {
            label: t("kpi.duplicate.withinRpd"),
            value: withinRpd,
            format: percent,
            icon: IoGitCompareOutline,
            status: withinRpd === null ? undefined : withinRpd >= WITHIN_PREFERRED ? "good" : "attention",
            hint: withinRpd === null ? undefined : t(withinRpd >= WITHIN_PREFERRED ? "kpi.duplicate.withinGood" : "kpi.duplicate.withinLow"),
          },
          { label: t("kpi.duplicate.averageRpd"), value: overview.averageRpd, format: percent, icon: IoSpeedometerOutline },
          {
            label: t("kpi.duplicate.lowestR2"),
            value: lowestR2?.r2 ?? null,
            format: decimal,
            icon: IoTrendingUpOutline,
            status: lowestR2 === null ? undefined : lowestR2.r2 >= R2_PREFERRED ? "good" : "attention",
            hint:
              lowestR2 === null
                ? t("kpi.duplicate.noFit")
                : t(lowestR2.r2 >= R2_PREFERRED ? "kpi.duplicate.r2Good" : "kpi.duplicate.r2Low", {
                    element: ELEMENT_LABELS[lowestR2.element],
                  }),
          },
        ]}
      />
      {shown.length > 0 ? <QcDuplicateTable elements={shown} /> : null}
      <QcDuplicateCharts data={data} elements={elements} />
      {data.truncated ? <p className="text-xs text-muted-foreground">{t("duplicate.truncated")}</p> : null}
    </section>
  );
}
