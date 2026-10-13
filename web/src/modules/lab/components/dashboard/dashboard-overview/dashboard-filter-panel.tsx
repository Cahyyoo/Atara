"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { MasterFilter } from "@/modules/lab/components/shared/master-filter";
import { SubFilterSelect } from "@/modules/lab/components/shared/sub-filter-select";
import type { SubFilter } from "@/modules/lab/validation/records";
import {
  IDENTITY_FILTERS,
  type IdentityKey,
} from "@/modules/lab/components/dashboard/dashboard-overview/identity-filters";

interface DashboardFilterPanelProps {
  identity: Record<IdentityKey, string>;
  onIdentityChange: (key: IdentityKey, value: string | null) => void;
  subs: SubFilter;
  onSubsChange: (subs: SubFilter) => void;
}

/** The five identity pickers and the sub-sample choice, opened from the Filters button. */
export function DashboardFilterPanel({
  identity,
  onIdentityChange,
  subs,
  onSubsChange,
}: DashboardFilterPanelProps) {
  const tMaster = useTranslations("masterData");

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-5" data-tour="dashboard-filter-panel">
      {IDENTITY_FILTERS.map(({ key, kind }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <Label htmlFor={`filter-${key}`}>{tMaster(`kind.${kind}`)}</Label>
          <MasterFilter
            kind={kind}
            className="w-full"
            value={identity[key]}
            onChange={(value) => onIdentityChange(key, value)}
          />
        </div>
      ))}
      {/* Counts barcodes as before; only the result figures follow it. */}
      <SubFilterSelect id="filter-subs" className="w-full" value={subs} onChange={onSubsChange} />
    </div>
  );
}
