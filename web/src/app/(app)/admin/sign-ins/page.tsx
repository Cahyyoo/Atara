import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { PageHeader } from "@/core/components/layout/page-header";
import { SignInAuditTable } from "@/modules/system/components/activity/sign-in-audit-table";

export const dynamic = "force-dynamic";

/**
 * Who signed in, from where, and who was refused -- across every department,
 * so it is the super admin's. The table loads its own list of people.
 */
export default async function SignInsPage() {
  await requireCapabilityPage("viewSignInAudit");
  const t = await getTranslations("signInAudit");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SignInAuditTable />
    </div>
  );
}
