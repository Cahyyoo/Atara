"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { QcDuplicate } from "@/modules/eksplorasi/types";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcDuplicateTable } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-table";
import {
  ALL,
  CriteriaLoading,
  CriteriaSelect,
  criteriaQuery,
  useCriteriaData,
} from "@/modules/eksplorasi/components/dashboard/qc-criteria";

/** The chart library in its own chunk, as for the control charts. */
const QcDuplicateCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-duplicate-charts").then((m) => m.QcDuplicateCharts),
  { ssr: false, loading: () => <ControlChartsSkeleton /> }
);

/**
 * The dashboard's duplicates, for one campaign and one month of their date
 * or all ("Campaign Criteria", "Month Criteria"): the duplicate table, then
 * every duplicate against the original its Remarks names, for the chosen
 * `elements`. Duplicates with no original to pair with are counted above the
 * charts, so an empty chart says why.
 */
export function QcDuplicateSection({ initial, elements }: { initial: QcDuplicate; elements: readonly ControlElement[] }) {
  const t = useTranslations("qcDashboard");
  const format = useFormatter();
  const [campaign, setCampaign] = useState(initial.campaign ?? ALL);
  const [month, setMonth] = useState(initial.month ?? ALL);

  const { data, loading, error } = useCriteriaData(
    "/api/data-sources/qc/duplicates",
    criteriaQuery({ campaign, month }),
    initial,
    criteriaQuery({ campaign: initial.campaign ?? ALL, month: initial.month ?? ALL })
  );
  const shown = data.elements.filter(({ element }) => elements.includes(element));
  const monthLabel = (value: string) =>
    format.dateTime(new Date(`${value}-01T00:00:00Z`), { month: "short", year: "numeric", timeZone: "UTC" });

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
            value={campaign}
            onChange={setCampaign}
            options={[
              { value: ALL, label: t("criteria.allCampaigns") },
              ...initial.campaigns.map((name) => ({ value: name, label: name })),
            ]}
          />
          <CriteriaSelect
            id="qc-duplicate-month"
            label={t("criteria.month")}
            value={month}
            onChange={setMonth}
            options={[
              { value: ALL, label: t("criteria.allMonths") },
              ...initial.months.map((value) => ({ value, label: monthLabel(value) })),
            ]}
          />
        </div>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      {shown.length > 0 ? <QcDuplicateTable elements={shown} /> : null}
      <QcDuplicateCharts data={data} elements={elements} />
      {data.truncated ? <p className="text-xs text-muted-foreground">{t("duplicate.truncated")}</p> : null}
    </section>
  );
}
