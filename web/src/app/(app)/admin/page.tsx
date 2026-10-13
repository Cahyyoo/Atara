import { getTranslations } from "next-intl/server";
import { AnnouncementsManager } from "@/modules/system/components/admin/announcements-manager";
import { BackupPanel } from "@/modules/system/components/admin/backup-panel";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { can } from "@/core/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * The super admin's system tools: announcements above every page, and the
 * backup. The department admins' accounts are on the Users page, the sign-in
 * trail under Sign-in Audit.
 */
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
      {can(session, "exportBackup") ? <BackupPanel /> : null}
    </div>
  );
}
