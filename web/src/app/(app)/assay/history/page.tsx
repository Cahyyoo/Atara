import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getActiveSession, requireCapabilityPage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { HistoryBackLink, ResultsHistory } from "@/components/assay/results-history";

export const dynamic = "force-dynamic";

/** Every change to the results, for whoever reads them. */
export default async function ResultsHistoryPage() {
  await requireCapabilityPage("viewRecordHistory");
  const session = await getActiveSession();
  const t = await getTranslations("history");
  // Back to the list this role works from.
  const back = session && can(session.role, "enterResults") ? "/assay" : "/database";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <HistoryBackLink href={back} label={t("back")} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Suspense fallback={<div className="h-[28rem] animate-pulse rounded-lg bg-muted/40" />}>
        <ResultsHistory />
      </Suspense>
    </div>
  );
}
