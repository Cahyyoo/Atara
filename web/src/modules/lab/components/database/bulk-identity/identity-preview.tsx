"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import type { Preview } from "@/modules/lab/components/database/bulk-identity/identity-plan";

/** The Sample IDs a save would produce, and any clash between them. */
export function IdentityPreview({
  shown,
  clashes,
  open,
  checking,
  recordCount,
}: {
  shown: Preview;
  clashes: string[];
  open: boolean;
  checking: boolean;
  recordCount: number;
}) {
  const t = useTranslations("database.bulkIdentity");
  return (
    <div
      inert={!open}
      className={cn(
        "grid shrink-0 transition-[grid-template-rows,opacity,margin] duration-200 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "-mt-3 grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-slot="bulk-identity-preview"
          className={cn(
            "flex max-h-48 flex-col gap-2 overflow-y-auto rounded-xl bg-muted/50 p-3 transition-opacity",
            checking && "opacity-60"
          )}
        >
          <p className="text-xs text-muted-foreground">
            {t("changedSummary", { changed: shown.changed, unchanged: recordCount - shown.changed })}
          </p>
          <ol className="flex flex-col gap-0.5 font-mono text-xs">
            {shown.preview.map((row) => (
              <li key={row.labCode} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{row.sampleCode}</span>
                <span className="text-muted-foreground line-through">{row.from ?? t("noIdent")}</span>
                <span aria-hidden>→</span>
                <span
                  className={row.to && clashes.includes(row.to) ? "font-semibold text-destructive" : "font-semibold"}
                >
                  {row.to ?? t("noIdent")}
                </span>
              </li>
            ))}
          </ol>
          {shown.more > 0 ? <p className="text-xs text-muted-foreground">{t("more", { count: shown.more })}</p> : null}
          {clashes.length > 0 ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t("clash", { ids: clashes.join(", ") })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
