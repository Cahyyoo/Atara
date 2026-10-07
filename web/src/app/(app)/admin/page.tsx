import { getTranslations } from "next-intl/server";
import { AnnouncementsManager } from "@/components/admin/announcements-manager";
import { BackupPanel } from "@/components/admin/backup-panel";
import { RolePasswordDefaults } from "@/components/admin/role-password-defaults";
import { requireCapabilityPage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** The administrator's own tools: announcements above every page, and the backup. */
export default async function AdminPage() {
  const session = await requireCapabilityPage("manageAnnouncements");
  const t = await getTranslations("admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <AnnouncementsManager />
      {can(session.role, "manageUsers") ? <RolePasswordDefaults /> : null}
      {can(session.role, "exportBackup") ? <BackupPanel /> : null}
    </div>
  );
}
