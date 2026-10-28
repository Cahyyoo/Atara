"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Skeleton } from "@/core/components/ui/skeleton";
import { apiFetch } from "@/core/lib/http/api-client";
import type { QcControl } from "@/modules/eksplorasi/types";
import { ControlElementPicker, useControlElements } from "@/modules/eksplorasi/components/dashboard/control-element-picker";
import { IoReloadOutline } from "react-icons/io5";

/** The chart library in its own chunk, as for the scatter plots. */
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
 * The dashboard's control charts: one OREAS standard, chosen by its CRM List
 * name ("Oreas Criteria"), and the elements ticked under Elements. The first
 * standard comes with the page; another choice asks for the next. Every
 * element comes in each answer, so ticking one shows it at once.
 */
export function QcControlSection({ initial }: { initial: QcControl }) {
  const t = useTranslations("qcDashboard");
  const tCommon = useTranslations("common");
  const [standard, setStandard] = useState(initial.standard ?? "");
  // The last answer, kept with the question it answers: the charts show it
  // once it matches what is asked, and the previous ones until then.
  const [answer, setAnswer] = useState<{ query: string; data?: QcControl; error?: string } | null>(null);
  const [shown, setShown] = useState<QcControl>(initial);
  const [elements, setElements] = useControlElements();

  const isInitial = standard === (initial.standard ?? "");
  const query = standard ? new URLSearchParams({ standard }).toString() : "";

  useEffect(() => {
    if (isInitial) return;
    let live = true;
    void apiFetch<QcControl>(`/api/data-sources/qc/control?${query}`, { networkError: tCommon("networkError") }).then(
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
  const choices = Object.fromEntries(data.standards.map((name) => [name, name]));

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
          <div className="flex items-end gap-3">
            {loading ? (
              <span className="flex items-center gap-1.5 pb-2 text-sm text-muted-foreground" role="status">
                <IoReloadOutline className="size-4 animate-spin" />
                {t("loading")}
              </span>
            ) : null}
            <ControlElementPicker shown={elements} onChange={setElements} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qc-control-standard">{t("control.criteria")}</Label>
              <Select value={standard} items={choices} onValueChange={(value) => setStandard(String(value ?? ""))}>
                <SelectTrigger id="qc-control-standard" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.standards.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <QcControlCharts data={data} elements={elements} />
          {data.truncated ? <p className="text-xs text-muted-foreground">{t("truncated")}</p> : null}
        </>
      )}
    </section>
  );
}
