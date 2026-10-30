"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { QcBlank } from "@/modules/eksplorasi/types";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcBlankTable } from "@/modules/eksplorasi/components/dashboard/qc-blank-table";
import {
  ALL,
  CriteriaLoading,
  CriteriaSelect,
  criteriaQuery,
  useCriteriaData,
} from "@/modules/eksplorasi/components/dashboard/qc-criteria";

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
 * Criteria"), as a table of the four elements with a blank limit and a
 * chart for each of them ticked under Elements.
 */
export function QcBlankSection({
  criteria,
  elements,
}: {
  criteria: ReturnType<typeof useBlankCriteria>;
  elements: readonly ControlElement[];
}) {
  const t = useTranslations("qcDashboard");
  const { data, loading, error, initial } = criteria;
  const entries = data.elements.filter(({ element }) => elements.includes(element));

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
