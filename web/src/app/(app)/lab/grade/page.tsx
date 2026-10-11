import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { GradeControlView } from "@/components/grade/grade-control";
import { requireCapabilityPage } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function GradeControlPage() {
  await requireCapabilityPage("readLabRecords");
  const t = await getTranslations("grade");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {/* The filters live in the URL, which a client component reads. */}
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-lg bg-muted/40" />}>
        <GradeControlView />
      </Suspense>
    </div>
  );
}
