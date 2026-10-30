"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Skeleton } from "@/core/components/ui/skeleton";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { QcControl } from "@/modules/eksplorasi/types";
import {
  ALL,
  CriteriaLoading,
  CriteriaSelect,
  criteriaQuery,
  useCriteriaData,
} from "@/modules/eksplorasi/components/dashboard/qc-criteria";
import { QcStandardTable } from "@/modules/eksplorasi/components/dashboard/qc-standard-table";

/** The chart library is the heaviest thing the page loads, so it comes in its own chunk. */
const QcControlCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-control-charts").then((m) => m.QcControlCharts),
  { ssr: false, loading: () => <ControlChartsSkeleton /> }
);

export function ControlChartsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[26rem] rounded-xl" />
      ))}
    </div>
  );
}

/**
 * The standards' choices -- the campaign ("Campaign Criteria") and the
 * standard whose charts are drawn ("Oreas Criteria") -- and the data they
 * ask for. Kept by the dashboard rather than the section, so its tab can
 * count what needs a look while another tab is open.
 */
export function useControlCriteria(initial: QcControl) {
  const [standard, setStandard] = useState(initial.standard ?? "");
  const [campaign, setCampaign] = useState(initial.campaign ?? ALL);
  const answer = useCriteriaData(
    "/api/data-sources/qc/control",
    criteriaQuery({ standard, campaign }),
    initial,
    criteriaQuery({ standard: initial.standard ?? "", campaign: initial.campaign ?? ALL })
  );
  return { initial, standard, setStandard, campaign, setCampaign, ...answer };
}

/**
 * The dashboard's standards: for one campaign or all, the standard table of
 * every OREAS standard, then the control charts of the one chosen -- both
 * for the dashboard's chosen `elements`.
 */
export function QcControlSection({
  criteria,
  elements,
}: {
  criteria: ReturnType<typeof useControlCriteria>;
  elements: readonly ControlElement[];
}) {
  const t = useTranslations("qcDashboard");
  const { data, loading, error, initial } = criteria;

  return (
    <section aria-labelledby="qc-control-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="qc-control-heading" className="text-lg font-semibold tracking-tight">
            {t("control.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("control.description", { method: data.testMethod })}</p>
        </div>
        {data.standards.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            {loading ? <CriteriaLoading /> : null}
            <CriteriaSelect
              id="qc-control-campaign"
              label={t("criteria.campaign")}
              value={criteria.campaign}
              onChange={criteria.setCampaign}
              options={[
                { value: ALL, label: t("criteria.allCampaigns") },
                ...initial.campaigns.map((name) => ({ value: name, label: name })),
              ]}
            />
            <CriteriaSelect
              id="qc-control-standard"
              label={t("control.criteria")}
              value={criteria.standard}
              onChange={criteria.setStandard}
              options={data.standards.map((name) => ({ value: name, label: name }))}
            />
          </div>
        ) : null}
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      {data.standard === null ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {t("control.noStandards", { method: data.testMethod })}
        </p>
      ) : (
        <>
          <QcStandardTable summary={data.summary.filter(({ element }) => elements.includes(element))} />
          <QcControlCharts data={data} elements={elements} />
          {data.truncated ? <p className="text-xs text-muted-foreground">{t("truncated")}</p> : null}
        </>
      )}
    </section>
  );
}
