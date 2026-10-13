import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { formatCount } from "@/core/lib/ui/kpi-format";
import type { ShiftScanSummary } from "@/modules/lab/lib/stages/my-scans";
import { IoScanOutline } from "react-icons/io5";

/**
 * An operator's own shift, at the top of their dashboard.
 *
 * The rest of the dashboard is about the samples; this is about the person
 * reading it -- what they have recorded since the shift began, stage by stage,
 * and how many of those were corrections. It follows the shift, not the date
 * filter above it, because "this shift" is the question and the filter answers
 * a different one.
 */
export async function MyScansCard({ summary }: { summary: ShiftScanSummary }) {
  const t = await getTranslations("dashboard.myScans");
  const tStages = await getTranslations("stages");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <CardDescription>{t("description", { shiftDate: summary.shiftDate })}</CardDescription>
        </div>
        <div className="surface-hero flex size-10 shrink-0 items-center justify-center rounded-xl text-white">
          <IoScanOutline className="size-5" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-3xl font-semibold tracking-tight">
            {formatCount(summary.total)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{t("scans")}</span>
          </p>
          {summary.corrections > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("corrections", { count: summary.corrections })}
            </p>
          ) : null}
        </div>

        {summary.byStage.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {summary.byStage.map((stage) => (
              <li
                key={stage.stageKey ?? stage.stageName}
                className="flex items-center gap-2 rounded-full border bg-muted/40 py-1 pl-3 pr-2 text-sm"
              >
                <span>{stageLabel(tStages, stage.stageKey, stage.stageName)}</span>
                <span className="rounded-full bg-background px-2 text-xs font-semibold">
                  {formatCount(stage.count)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}
