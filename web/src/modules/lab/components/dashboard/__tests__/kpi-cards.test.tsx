// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { en } from "@/core/i18n/test-messages";
import { KpiCards } from "@/modules/lab/components/dashboard/kpi-cards";
import { dashboardLayoutFor } from "@/modules/lab/lib/analytics/dashboard-layout";
import type { AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";

const KPI: AnalyticsResult["kpi"] = {
  total: 40,
  pending: 2,
  inProgress: 20,
  completed: 18,
  awaitingAssay: 5,
  overdue: 3,
  averageCycleHours: 30,
};

afterEach(cleanup);

function tileTitles(keys: Parameters<typeof KpiCards>[0]["keys"]) {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <KpiCards kpi={KPI} rangeLabel="Last 14 days" keys={keys} />
    </NextIntlClientProvider>
  );
  return [...container.querySelectorAll('[data-slot="card-title"]')].map((node) => node.textContent);
}

describe("the KPI tiles", () => {
  it("shows all six when no keys are given", () => {
    expect(tileTitles(undefined)).toHaveLength(6);
  });

  it("shows the analyst's tiles, results still to enter first", () => {
    expect(tileTitles(dashboardLayoutFor("ANALISIS").kpis)).toEqual([
      en.dashboard.kpi.awaitingAssay,
      en.dashboard.kpi.completed,
      en.dashboard.kpi.cycleTime,
    ]);
  });

  it("shows the operator only what is moving and what is stuck", () => {
    expect(tileTitles(dashboardLayoutFor("OPERATOR").kpis)).toEqual([
      en.dashboard.kpi.inProgress,
      en.dashboard.kpi.needsAttention,
    ]);
  });

  it("counts the finished share against the samples received, not barcodes never scanned", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
        <KpiCards kpi={KPI} rangeLabel="Last 14 days" keys={["completed"]} />
      </NextIntlClientProvider>
    );
    // 18 of the 38 received (20 in progress + 18 done), not of all 40.
    expect(container.textContent).toContain("47% of received samples");
  });
});
