import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/lib/page-auth";
import { LabelReprint } from "@/components/samples/label-reprint";

export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  await requireCapabilityPage("printLabels");
  const t = await getTranslations("samples.labels");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <LabelReprint />
    </div>
  );
}
