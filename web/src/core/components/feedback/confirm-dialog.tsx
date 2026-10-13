"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { IoReloadOutline } from "react-icons/io5";

/**
 * "Are you sure?" for something that cannot be undone: a title, what will
 * happen, and a destructive button that shows it is working. The caller does
 * the work in `onConfirm` and passes back any error to show.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** Anything more to say or ask between the description and the buttons. */
  children?: ReactNode;
}) {
  const tCommon = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={(value) => (!value && !busy ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <InlineNotice tone="error">{error ?? null}</InlineNotice>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" className="gap-2" disabled={busy} onClick={onConfirm}>
            {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
