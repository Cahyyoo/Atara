"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";

/** One form for all the records, or one per Sample ID. */
export function ModeSwitch({
  mode,
  recordCount,
  groupCount,
  onMode,
}: {
  mode: "together" | "each";
  recordCount: number;
  groupCount: number;
  onMode: (mode: "together" | "each") => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  return (
    <div className="flex w-fit flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
      {(["together", "each"] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={mode === choice}
          onClick={() => onMode(choice)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            mode === choice
              ? "bg-background font-medium text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {choice === "together" ? t("modeTogether", { count: recordCount }) : t("modeEach", { count: groupCount })}
        </button>
      ))}
    </div>
  );
}
