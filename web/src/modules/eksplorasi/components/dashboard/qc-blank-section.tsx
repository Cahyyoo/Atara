"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { apiFetch } from "@/core/lib/http/api-client";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { QcBlank } from "@/modules/eksplorasi/types";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcBlankTable } from "@/modules/eksplorasi/components/dashboard/qc-blank-table";
import { IoReloadOutline } from "react-icons/io5";

/** The chart library in its own chunk, as for the other charts. */
const QcBlankCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-blank-charts").then((m) => m.QcBlankCharts),
  { ssr: false, loading: () => <ControlChartsSkeleton /> }
);

/** Every campaign, in the Select (whose value cannot be empty). */
const ALL = "ALL";

/**
 * The dashboard's blanks: one campaign's or every one's ("Campaign
 * Criteria"), as a table of the four elements with a blank limit and a chart
 * for each of them ticked under Elements. Every campaign comes with the page;
 * another choice asks for that one.
 */
export function QcBlankSection({ initial, elements }: { initial: QcBlank; elements: readonly ControlElement[] }) {
  const t = useTranslations("qcDashboard");
  const tCommon = useTranslations("common");
  const [campaign, setCampaign] = useState(initial.campaign ?? ALL);
  // The last answer, kept with the question it answers, as the control charts do.
  const [answer, setAnswer] = useState<{ query: string; data?: QcBlank; error?: string } | null>(null);
  const [shown, setShown] = useState<QcBlank>(initial);

  const isInitial = campaign === (initial.campaign ?? ALL);
  const query = campaign === ALL ? "" : new URLSearchParams({ campaign }).toString();

  useEffect(() => {
    if (isInitial) return;
    let live = true;
    void apiFetch<QcBlank>(`/api/data-sources/qc/blank?${query}`, { networkError: tCommon("networkError") }).then(
      (outcome) => {
        if (!live) return;
        if (outcome.ok) {
          setShown(outcome.data);
          setAnswer({ query, data: outcome.data });
        } else {
          setAnswer({ query, error: outcome.error });
        }
      }
    );
    return () => {
      live = false;
    };
  }, [query, isInitial, tCommon]);

  const data = isInitial ? initial : shown;
  const loading = !isInitial && answer?.query !== query;
  const error = !isInitial && answer?.query === query ? (answer.error ?? null) : null;
  const entries = data.elements.filter(({ element }) => elements.includes(element));
  const choices = { [ALL]: t("blank.allCampaigns"), ...Object.fromEntries(initial.campaigns.map((name) => [name, name])) };

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
          {loading ? (
            <span className="flex items-center gap-1.5 pb-2 text-sm text-muted-foreground" role="status">
              <IoReloadOutline className="size-4 animate-spin" />
              {t("loading")}
            </span>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qc-blank-campaign">{t("blank.criteria")}</Label>
            <Select value={campaign} items={choices} onValueChange={(value) => setCampaign(String(value ?? ALL))}>
              <SelectTrigger id="qc-blank-campaign" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("blank.allCampaigns")}</SelectItem>
                {initial.campaigns.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
