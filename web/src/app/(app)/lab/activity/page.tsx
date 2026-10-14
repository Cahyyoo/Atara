import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { PageHeader } from "@/core/components/layout/page-header";
import { loadStages } from "@/modules/lab/lib/stages/stages-cache";
import { StageActivityTable } from "@/modules/lab/components/activity/stage-activity-table";

export const dynamic = "force-dynamic";

/**
 * Who moved which sample. The sign-in trail is the super admin's
 * (/admin/sign-ins), since it covers every department.
 *
 * Lab admin only, like Users and Master Data, because this is data about
 * people as much as about samples. Preparators keep what they already had: the
 * timeline on a sample's own page, which has always named who did each step.
 */
export default async function ActivityPage() {
  await requireCapabilityPage("viewActivity");

  // Only what the stage filter row reads.
  const [stages, t] = await Promise.all([loadStages(), getTranslations("stageActivity")]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <StageActivityTable stages={stages.map(({ id, key, name }) => ({ id, key, name }))} />
    </div>
  );
}
