"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { BlankOverview } from "@/modules/eksplorasi/lib/qc-overview";
import type { QcBlank } from "@/modules/eksplorasi/types";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcBlankTable } from "@/modules/eksplorasi/components/dashboard/qc-blank-table";
import { QcKpiCards } from "@/modules/eksplorasi/components/dashboard/qc-kpi-cards";
import {
  ALL,
  CriteriaLoading,
  CriteriaSelect,
  criteriaQuery,
  useCriteriaData,
} from "@/modules/eksplorasi/components/dashboard/qc-criteria";
import { IoAlertCircleOutline, IoBeakerOutline, IoListOutline, IoPieChartOutline } from "react-icons/io5";

/** The chart library in its own chunk, as for the other charts. */
const QcBlankCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-blank-charts").then((m) => m.QcBlankCharts),
  { ssr: false, loading: () => <ControlChartsSkeleton /> }
);

/** The blanks' choice of campaign, and the data it asks for -- kept by the dashboard, as the standards' are. */
export function useBlankCriteria(initial: QcBlank) {
  const [campaign, setCampaign] = useState(initial.campaign ?? ALL);
  const answer = useCriteriaData(
    "/api/data-sources/qc/blank",
    criteriaQuery({ campaign }),
    initial,
    criteriaQuery({ campaign: initial.campaign ?? ALL })
  );
  return { initial, campaign, setCampaign, ...answer };
}

/**
 * The dashboard's blanks: one campaign's or every one's ("Campaign
 * Criteria"), as summary cards, a table of the four elements with a blank
 * limit, and a chart for each of them ticked under Elements.
 */
export function QcBlankSection({
  criteria,
  overview,
  elements,
}: {
  criteria: ReturnType<typeof useBlankCriteria>;
  overview: BlankOverview;
  elements: readonly ControlElement[];
}) {
  const t = useTranslations("qcDashboard");
  const format = useFormatter();
  const { data, loading, error, initial } = criteria;
  const entries = data.elements.filter(({ element }) => elements.includes(element));
  const count = (value: number) => format.number(Math.round(value));
  const percent = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 1 });
  const anomalous = overview.elementsWithAnomaly.map((element) => ELEMENT_LABELS[element]);

  return (
    <section aria-labelledby="qc-blank-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="qc-blank-heading" className="text-lg font-semibold tracking-tight">
            {t("blank.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("blank.description")}</p>
        </div>
        <div className="flex items-end gap-3">
          {loading ? <CriteriaLoading /> : null}
          <CriteriaSelect
            id="qc-blank-campaign"
            label={t("criteria.campaign")}
            value={criteria.campaign}
            onChange={criteria.setCampaign}
            options={[
              { value: ALL, label: t("criteria.allCampaigns") },
              ...initial.campaigns.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <QcKpiCards
        label={t("kpi.label", { section: t("blank.title") })}
        items={[
          { label: t("kpi.blank.blanks"), value: overview.blanks, format: count, icon: IoBeakerOutline },
          {
            label: t("kpi.blank.anomalies"),
            value: overview.anomalies,
            format: count,
            icon: IoAlertCircleOutline,
            status: overview.anomalies > 0 ? "attention" : "good",
            hint: t(overview.anomalies > 0 ? "kpi.check" : "kpi.none"),
          },
          { label: t("kpi.blank.anomalyShare"), value: overview.anomalyShare, format: percent, icon: IoPieChartOutline },
          {
            label: t("kpi.blank.elements"),
            value: anomalous.length,
            format: count,
            icon: IoListOutline,
            status: anomalous.length > 0 ? "attention" : "good",
            hint: anomalous.length > 0 ? anomalous.join(", ") : t("kpi.none"),
          },
        ]}
      />
      <QcBlankTable data={data} />
      {entries.length > 0 ? (
        <QcBlankCharts entries={entries} />
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("blank.noElements")}
        </p>
      )}
      {data.truncated ? <p className="text-xs text-muted-foreground">{t("blank.truncated")}</p> : null}
    </section>
  );
}
