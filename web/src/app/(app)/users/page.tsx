import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/lib/page-auth";
import { UsersTable } from "@/components/users/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireCapabilityPage("manageUsers");
  const t = await getTranslations("users");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <UsersTable currentUserId={session.userId} />
    </div>
  );
}
