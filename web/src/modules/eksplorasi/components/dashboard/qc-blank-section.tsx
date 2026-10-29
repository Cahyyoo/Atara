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

/**
 * The dashboard's blanks: one campaign's or every one's ("Campaign
 * Criteria"), as a table of the four elements with a blank limit and a chart
 * for each of them ticked under Elements. Every campaign comes with the page;
 * another choice asks for that one.
 */
export function QcBlankSection({ initial, elements }: { initial: QcBlank; elements: readonly ControlElement[] }) {
  const t = useTranslations("qcDashboard");
  const [campaign, setCampaign] = useState(initial.campaign ?? ALL);
  const { data, loading, error } = useCriteriaData(
    "/api/data-sources/qc/blank",
    criteriaQuery({ campaign }),
    initial,
    criteriaQuery({ campaign: initial.campaign ?? ALL })
  );
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
            value={campaign}
            onChange={setCampaign}
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
