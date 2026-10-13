import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { personaOf } from "@/core/lib/auth/permissions";
import { UsersTable } from "@/modules/system/components/users/users-table";
import { RolePasswordDefaults } from "@/modules/system/components/admin/role-password-defaults";

export const dynamic = "force-dynamic";

/**
 * One page for every manager, scoped to whoever opens it (user-scope.ts): the
 * super admin manages the department admins, the lab's admin its staff. The
 * default passwords below it are for the same roles only.
 */
export default async function UsersPage() {
  const session = await requireCapabilityPage("manageUsers");
  const t = await getTranslations("users");
  const manager = { role: session.role, department: session.department };
  const isSuperAdmin = personaOf(manager) === "SUPER_ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isSuperAdmin ? t("adminsTitle") : t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin ? t("adminsSubtitle") : t("subtitle")}
        </p>
      </div>

      <UsersTable currentUserId={session.userId} manager={manager} />

      <div id="role-passwords" className="scroll-mt-20">
        <RolePasswordDefaults />
      </div>
    </div>
  );
}
