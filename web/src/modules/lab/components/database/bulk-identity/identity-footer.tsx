"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { DialogFooter } from "@/core/components/ui/dialog";
import { cn } from "@/core/lib/utils";
import { IoChevronDown, IoReloadOutline } from "react-icons/io5";
import type { Preview } from "@/modules/lab/components/database/bulk-identity/identity-plan";
import type { StatusLine } from "@/modules/lab/components/database/bulk-identity/use-bulk-identity-form";

/** What a save would do, the way to the preview, and Cancel / Save. */
export function IdentityFooter({
  status,
  checking,
  shown,
  clashCount,
  showPreview,
  previewOpen,
  otherModeChanged,
  ready,
  busy,
  recordCount,
  onPreviewOpen,
  onCancel,
  onSave,
}: {
  status: StatusLine;
  checking: boolean;
  shown: Preview | null;
  clashCount: number;
  showPreview: boolean;
  previewOpen: boolean;
  otherModeChanged: boolean;
  ready: boolean;
  busy: boolean;
  recordCount: number;
  onPreviewOpen: (open: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const tCommon = useTranslations("common");
  return (
    <DialogFooter className="gap-2 sm:items-center">
      <div className="flex min-w-0 flex-col gap-0.5 sm:mr-auto">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            role="status"
            aria-busy={checking}
            className={cn(
              "flex items-center gap-1.5 text-sm transition-opacity duration-150",
              status.tone === "error"
                ? "text-destructive"
                : status.tone === "ok"
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              checking && shown !== null && "opacity-60"
            )}
          >
            {checking ? <IoReloadOutline aria-hidden className="size-3.5 shrink-0 animate-spin" /> : null}
            {status.text}
          </p>
          {shown ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              aria-expanded={showPreview}
              disabled={clashCount > 0}
              onClick={() => onPreviewOpen(!previewOpen)}
            >
              {t("showPreview")}
              <IoChevronDown aria-hidden className={cn("size-3.5 transition-transform", showPreview && "rotate-180")} />
            </Button>
          ) : null}
        </div>
        {otherModeChanged ? <p className="text-xs text-muted-foreground">{t("otherModeChanges")}</p> : null}
      </div>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
        {tCommon("cancel")}
      </Button>
      <Button type="button" className="gap-2" disabled={!ready || busy} onClick={onSave}>
        {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
        {t("save", { count: shown?.changed ?? recordCount })}
      </Button>
    </DialogFooter>
  );
}
