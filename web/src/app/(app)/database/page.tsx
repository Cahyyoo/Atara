import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LabRecordsTable } from "@/components/shared/lab-records-table";
import { requireCapabilityPage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SampleDatabasePage() {
  const session = await requireCapabilityPage("viewDatabase");
  const t = await getTranslations("database");

  // An administrator reads, exports and looks at what was deleted; only the
  // Database role changes anything. The routes behind each of these check the
  // same capabilities, so this decides what is shown, not what is allowed.
  const access = {
    canEdit: can(session.role, "editDatabase"),
    canExport: can(session.role, "exportDatabase"),
    canViewDeleted: can(session.role, "viewDeletedRecords"),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* A placeholder the size of the table rather than nothing: an empty
          gap under the heading reads as a page that failed to load. */}
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-lg bg-muted/40" />}>
        <LabRecordsTable access={access} />
      </Suspense>
    </div>
  );
}
