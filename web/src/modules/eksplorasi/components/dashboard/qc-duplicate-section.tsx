"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { QcDuplicate } from "@/modules/eksplorasi/types";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";

/** The chart library in its own chunk, as for the control charts. */
const QcDuplicateCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-duplicate-charts").then((m) => m.QcDuplicateCharts),
  { ssr: false, loading: () => <ControlChartsSkeleton /> }
);

/**
 * The dashboard's duplicate charts, for its chosen `elements`: every
 * duplicate against the original its Remarks names. Duplicates with no
 * original to pair with are counted above the charts, so an empty chart
 * says why.
 */
export function QcDuplicateSection({ data, elements }: { data: QcDuplicate; elements: readonly ControlElement[] }) {
  const t = useTranslations("qcDashboard.duplicate");
  return (
    <section aria-labelledby="qc-duplicate-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="qc-duplicate-heading" className="text-lg font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {data.unmatched > 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">{t("unmatched", { count: data.unmatched })}</p>
        ) : null}
      </div>
      <QcDuplicateCharts data={data} elements={elements} />
      {data.truncated ? <p className="text-xs text-muted-foreground">{t("truncated")}</p> : null}
    </section>
  );
}
