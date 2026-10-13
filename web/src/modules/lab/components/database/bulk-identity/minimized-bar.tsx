"use client";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { IoClose, IoExpandOutline } from "react-icons/io5";

/** The small bar a minimized dialog leaves behind: back to it, or discard it. */
export function MinimizedBar({
  count,
  changed,
  busy,
  onRestore,
  onCancel,
}: {
  count: number;
  changed: number;
  busy: boolean;
  onRestore: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  return createPortal(
    <div
      role="region"
      aria-label={t("minimizedTitle")}
      className="fixed right-4 bottom-20 z-40 flex max-w-[calc(100%-2rem)] animate-in items-center gap-3 rounded-2xl border bg-popover py-2 pr-2 pl-4 text-sm text-popover-foreground shadow-raised duration-200 ease-out fade-in-0 slide-in-from-bottom-3"
    >
      <div className="min-w-0">
        <p className="font-medium">{t("minimizedTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("minimizedSummary", { count, changed })}</p>
      </div>
      <Button type="button" size="sm" className="gap-1.5" onClick={onRestore}>
        <IoExpandOutline aria-hidden className="size-4" />
        {t("restore")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("discard")}
        title={t("discard")}
        disabled={busy}
        onClick={onCancel}
      >
        <IoClose />
      </Button>
    </div>,
    document.body
  );
}
