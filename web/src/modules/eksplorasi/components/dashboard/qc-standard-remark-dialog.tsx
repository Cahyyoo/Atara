"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Label } from "@/core/components/ui/label";
import { Textarea } from "@/core/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { apiFetch, jsonBody } from "@/core/lib/http/api-client";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import { IoReloadOutline } from "react-icons/io5";

/** As long as the column holds. */
export const REMARKS_MAX_LENGTH = 500;

/** The Remarks being written: on which standard and element, and what they say now. */
export interface RemarkTarget {
  standard: string;
  element: ControlElement;
  remarks: string | null;
}

/**
 * Writing the Remarks on one standard and element of the standard table.
 * Shared by every campaign; saving them empty removes them.
 */
export function QcStandardRemarkDialog({
  target,
  onClose,
  onSaved,
}: {
  /** Mounted afresh (a new key) for each cell it opens on. */
  target: RemarkTarget;
  onClose: () => void;
  onSaved: (saved: RemarkTarget) => void;
}) {
  const t = useTranslations("qcDashboard.control.remarkDialog");
  const tCommon = useTranslations("common");
  const [remarks, setRemarks] = useState(target.remarks ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const element = ELEMENT_LABELS[target.element];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await apiFetch<RemarkTarget>("/api/data-sources/qc/standard-remarks", {
      ...jsonBody("PUT", { standard: target.standard, element: target.element, remarks: remarks.trim() }),
      networkError: tCommon("networkError"),
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    onSaved(outcome.data);
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { standard: target.standard, element })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form id="qc-standard-remark-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qc-standard-remark">{t("label")}</Label>
            <Textarea
              id="qc-standard-remark"
              autoFocus
              rows={4}
              maxLength={REMARKS_MAX_LENGTH}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {remarks.length}/{REMARKS_MAX_LENGTH}
            </p>
          </div>
          <InlineNotice tone="error">{error}</InlineNotice>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" form="qc-standard-remark-form" disabled={busy} className="gap-2">
            {busy ? <IoReloadOutline aria-hidden className="size-4 animate-spin" /> : null}
            {busy ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
