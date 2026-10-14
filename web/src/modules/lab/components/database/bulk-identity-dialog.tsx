"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { cn } from "@/core/lib/utils";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { IoRemoveOutline } from "react-icons/io5";
import { BulkIdentityForm } from "@/modules/lab/components/database/bulk-identity/bulk-identity-form";

export { groupBySampleIdent, summarizeCurrent } from "@/modules/lab/components/database/bulk-identity/identity-plan";

/**
 * Filling in, or changing, the identity of several records at once: a batch
 * of new barcodes from the same place and pit, or twenty samples entered
 * under the wrong pit.
 *
 * Ordinary forms: one for all the records, or one per Sample ID (the records
 * without one share a form) -- a list of them on the left, the chosen one's
 * fields on the right. Each field starts on what its records hold now -- the
 * value itself when they agree, empty when none has one, "mixed" when they
 * differ -- so a field left alone changes nothing, a new value is set on its
 * records, and emptying a field clears it. Each changed field says so and can
 * be put back. Everything is saved together; the footer says what a save
 * would do, the Sample IDs it produces are a click away, and a clash --
 * between forms too -- blocks the save and shows itself.
 *
 * Kept light on purpose: no backdrop blur behind it, one form drawn at a
 * time, the pickers do not lock the page, and typing redraws one field.
 *
 * It can be minimized to a small bar, to look at the table behind it: the
 * dialog is hidden, not closed, so everything typed is still there when it
 * is opened again.
 */
export function BulkIdentityDialog({
  records,
  open,
  minimized = false,
  onMinimizedChange,
  onClose,
  onSaved,
  canAddOption = false,
}: {
  /** In table order: the order sample numbers are given in. */
  records: LabRecordListItemDTO[];
  open: boolean;
  /** Hidden behind a small bar, with everything typed kept. */
  minimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
  /** Whether a picker may add a missing code to the master data. */
  canAddOption?: boolean;
}) {
  const t = useTranslations("database.bulkIdentity");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open && !minimized}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent
        keepMounted
        className={cn(
          "max-h-[90vh] gap-3 overflow-hidden duration-200 ease-out sm:max-w-4xl",
          // Minimizing, it shrinks toward the bar that takes its place.
          minimized && "data-closed:origin-bottom-right data-closed:slide-out-to-right-8 data-closed:slide-out-to-bottom-8"
        )}
        overlayClassName="bg-black/30 supports-backdrop-filter:backdrop-blur-none"
      >
        <DialogHeader className="gap-1 pr-16">
          <DialogTitle>{t("title", { count: records.length })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {onMinimizedChange ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-10"
            aria-label={t("minimize")}
            title={t("minimize")}
            disabled={busy}
            onClick={() => onMinimizedChange(true)}
          >
            <IoRemoveOutline />
          </Button>
        ) : null}
        {/* A fresh form for every opening and every selection, starting from
            what these records hold now -- and kept while minimized. */}
        {open ? (
          <BulkIdentityForm
            key={records.map((record) => record.id).join(",")}
            records={records}
            busy={busy}
            minimized={minimized}
            onRestore={() => onMinimizedChange?.(false)}
            onBusy={setBusy}
            canCreateOption={canAddOption}
            onCancel={onClose}
            onSaved={() => {
              onSaved();
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
