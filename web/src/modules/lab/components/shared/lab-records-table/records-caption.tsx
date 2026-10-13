"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";

/**
 * The table's own caption: how many rows the filters found, and -- for an
 * admin -- which set of rows this is. A view, not an action: deleted rows
 * are either what the table shows or absent from it.
 */
export function RecordsCaption({
  total,
  showViews,
  showDeleted,
  onViewChange,
}: {
  /** Null until the first page has been read. */
  total: number | null;
  showViews: boolean;
  showDeleted: boolean;
  onViewChange: (deleted: boolean) => void;
}) {
  const t = useTranslations("database");
  const tCommon = useTranslations("common");

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5">
      <span className="text-sm text-muted-foreground">
        {total !== null ? t("caption", { count: total }) : tCommon("loading")}
      </span>
      {showViews ? (
        <div data-tour="records-view" role="tablist" aria-label={t("viewLabel")} className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {[
            { deleted: false, label: t("activeView") },
            { deleted: true, label: t("deletedView") },
          ].map((view) => (
            <button
              key={String(view.deleted)}
              type="button"
              role="tab"
              aria-selected={showDeleted === view.deleted}
              onClick={() => {
                if (showDeleted === view.deleted) return;
                onViewChange(view.deleted);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                showDeleted === view.deleted
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {view.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
