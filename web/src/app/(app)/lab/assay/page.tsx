import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { ResultsPage } from "@/modules/lab/components/assay/results-page";

export const dynamic = "force-dynamic";

export default async function BulkEntryPage() {
  await requireCapabilityPage("enterResults");
  const t = await getTranslations("assay");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* The tabs and the grid read the URL, which needs a Suspense boundary;
          the placeholder holds the page's place meanwhile. */}
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-lg bg-muted/40" />}>
        <ResultsPage />
      </Suspense>
    </div>
  );
}
