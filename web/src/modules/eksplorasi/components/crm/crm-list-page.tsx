"use client";

import { CRM_KINDS } from "@/modules/eksplorasi/lib/crm-list-columns";
import { CrmTable } from "@/modules/eksplorasi/components/crm/crm-table";

/** The three CRM tables, in the lab sheet's order: Standart, Blank, Duplicate. */
export function CrmListPage() {
  return (
    <div className="flex flex-col gap-6">
      {CRM_KINDS.map((kind) => (
        <CrmTable key={kind} kind={kind} />
      ))}
    </div>
  );
}
