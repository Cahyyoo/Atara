"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Skeleton } from "@/core/components/ui/skeleton";
import { apiFetch } from "@/core/lib/http/api-client";
import { ELEMENT_FIELDS, ELEMENT_LABELS, type ElementField } from "@/modules/eksplorasi/lib/data-source-columns";
import type { QcCharts, QcControl } from "@/modules/eksplorasi/types";
import { QcControlSection } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { IoReloadOutline } from "react-icons/io5";

/**
 * The chart library is the heaviest thing the page loads, so it comes in its
 * own chunk: the filters arrive without waiting for it.
 */
const QcScatterCharts = dynamic(
  () => import("@/modules/eksplorasi/components/dashboard/qc-scatter-charts").then((m) => m.QcScatterCharts),
  { ssr: false, loading: () => <ChartsSkeleton /> }
);

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Skeleton className="h-[26rem] rounded-xl" />
      <Skeleton className="h-[26rem] rounded-xl" />
    </div>
  );
}

/**
 * The eksplorasi dashboard: the QC charts for one element (Ni to start with),
 * over every assay or a window of dates. The first set comes with the page;
 * a change of element or dates asks for the next. Below them, the control
 * charts of one OREAS standard, over the same dates.
 */
export function QcDashboard({ initial, initialControl }: { initial: QcCharts; initialControl: QcControl }) {
  const t = useTranslations("qcDashboard");
  const tCommon = useTranslations("common");
  const [element, setElement] = useState<ElementField>(initial.element);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // The last answer, kept with the question it answers: the page shows it
  // once it matches what is asked, and the previous charts until then.
  const [answer, setAnswer] = useState<{ query: string; data?: QcCharts; error?: string } | null>(null);
  const [shown, setShown] = useState<QcCharts>(initial);

  const isInitial = element === initial.element && !from && !to;
  const params = new URLSearchParams({ element });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();

  useEffect(() => {
    if (isInitial) return;
    let live = true;
    void apiFetch<QcCharts>(`/api/data-sources/qc?${query}`, { networkError: tCommon("networkError") }).then((outcome) => {
      if (!live) return;
      if (outcome.ok) {
        setShown(outcome.data);
        setAnswer({ query, data: outcome.data });
      } else {
        setAnswer({ query, error: outcome.error });
      }
    });
    return () => {
      live = false;
    };
  }, [query, isInitial, tCommon]);

  const data = isInitial ? initial : shown;
  const loading = !isInitial && answer?.query !== query;
  const error = !isInitial && answer?.query === query ? (answer.error ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-element">{t("element")}</Label>
          <Select
            value={element}
            items={ELEMENT_LABELS}
            onValueChange={(value) => setElement(value as ElementField)}
          >
            <SelectTrigger id="qc-element" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEMENT_FIELDS.map((field) => (
                <SelectItem key={field} value={field}>
                  {ELEMENT_LABELS[field]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-from">{t("from")}</Label>
          <Input id="qc-from" type="date" className="w-44" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qc-to">{t("to")}</Label>
          <Input id="qc-to" type="date" className="w-44" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </div>
        {loading ? (
          <span className="flex items-center gap-1.5 pb-2 text-sm text-muted-foreground" role="status">
            <IoReloadOutline className="size-4 animate-spin" />
            {t("loading")}
          </span>
        ) : null}
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <QcScatterCharts data={data} />

      <QcControlSection initial={initialControl} from={from} to={to} />
    </div>
  );
}
