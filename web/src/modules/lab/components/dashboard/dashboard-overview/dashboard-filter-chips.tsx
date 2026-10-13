"use client";

import { useTranslations } from "next-intl";
import type { MasterKind } from "@/modules/lab/types";
import { IoClose } from "react-icons/io5";
import type { IdentityKey } from "@/modules/lab/components/dashboard/dashboard-overview/identity-filters";

/** One applied identity filter, named by its kind and the code it is set to. */
export interface FilterChip {
  key: IdentityKey;
  kind: MasterKind;
  label: string;
  code: string;
}

interface DashboardFilterChipsProps {
  chips: FilterChip[];
  onRemove: (key: IdentityKey) => void;
}

/** The applied filters, each a button that removes it. */
export function DashboardFilterChips({ chips, onRemove }: DashboardFilterChipsProps) {
  const t = useTranslations("dashboard");

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            className="flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-2.5 pr-2 text-xs transition-colors hover:bg-muted"
          >
            <span className="text-muted-foreground">{chip.label}:</span>
            <span className="font-medium">{chip.code}</span>
            <IoClose aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="sr-only">{t("removeFilter", { name: chip.label })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
