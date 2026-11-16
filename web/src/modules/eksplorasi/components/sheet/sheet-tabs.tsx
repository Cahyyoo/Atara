"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { DATA_SOURCE_VIEWS, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";
import { DRAFT_EVENT, hasDraft } from "@/modules/eksplorasi/components/sheet/sheet-draft";
import type { DataSourceView } from "@/modules/eksplorasi/types";

function subscribe(listener: () => void) {
  window.addEventListener(DRAFT_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(DRAFT_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** The lists holding a draft, as one string so the snapshot stays the same while nothing changes. */
const drafted = () => DATA_SOURCE_VIEWS.filter(hasDraft).join(",");

/**
 * The four lists' sheets as tabs under the grid, as a workbook's sheets are:
 * one click to another list's sheet, the work on this one kept as a draft
 * (sheet-draft.ts) and put back on return. A dot marks a list with work kept.
 */
export function SheetTabs({ view }: { view: DataSourceView }) {
  const t = useTranslations("dataSource");
  const withDraft = useSyncExternalStore(subscribe, drafted, () => "").split(",");

  return (
    <nav
      aria-label={t("sheet.sheetsLabel")}
      className="sticky bottom-0 z-20 -mx-4 flex gap-0.5 overflow-x-auto border-t bg-canvas/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6"
    >
      {DATA_SOURCE_VIEWS.map((each) => {
        const active = each === view;
        return (
          <Link
            key={each}
            href={`${VIEWS[each].path}/new`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mt-px flex shrink-0 items-center gap-1.5 rounded-b-md border border-t-0 px-4 py-1.5 text-sm transition-colors",
              active
                ? "border-border bg-background font-semibold text-primary"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t(`views.${each}.title`)}
            {withDraft.includes(each) ? (
              <span aria-label={t("sheet.draftMark")} title={t("sheet.draftMark")} className="size-1.5 rounded-full bg-amber-500" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
