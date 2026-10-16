import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { getLabSettings } from "@/modules/lab/lib/settings/lab-settings";
import { LabSettingsForm } from "@/modules/lab/components/settings/lab-settings-form";

export const dynamic = "force-dynamic";

/** The lab admin's switches for the module. */
export default async function LabSettingsPage() {
  await requireCapabilityPage("manageLabSettings");
  const [settings, t] = await Promise.all([getLabSettings(), getTranslations("labSettings")]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <LabSettingsForm initial={settings} />
    </div>
  );
}
