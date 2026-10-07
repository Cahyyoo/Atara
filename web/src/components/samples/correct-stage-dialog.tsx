"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { stageLabel } from "@/lib/stages";
import type { ApiResult } from "@/types";
import { IoGitCompareOutline, IoReloadOutline } from "react-icons/io5";

const MIN_REASON = 5;

/**
 * An administrator's stage correction, from a sample's page.
 *
 * Any stage but the current one, and a reason that goes onto the timeline
 * beside the "Correction" badge. Asks twice: it rewrites where the lab thinks
 * the sample is.
 */
export function CorrectStageButton({
  sampleCode,
  currentStageId,
  stages,
}: {
  sampleCode: string;
  currentStageId: string | null;
  stages: { id: string; key: string | null; name: string }[];
}) {
  const t = useTranslations("samples.correct");
  const tStages = useTranslations("stages");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = stages.filter((stage) => stage.id !== currentStageId);
  const labelById = Object.fromEntries(
    choices.map((stage) => [stage.id, stageLabel(tStages, stage.key, stage.name)])
  );
  const ready = stageId !== null && reason.trim().length >= MIN_REASON;

  function close() {
    if (busy) return;
    setOpen(false);
    setStageId(null);
    setReason("");
    setConfirming(false);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/samples/${encodeURIComponent(sampleCode)}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId, reason: reason.trim() }),
      });
      const result: ApiResult<unknown> = await response.json();
      if (!result.success) {
        setError(result.error || tCommon("networkError"));
        setConfirming(false);
        return;
      }
      toast(t("done", { stage: labelById[stageId!] ?? "" }));
      setBusy(false);
      close();
      router.refresh();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button data-tour="sample-correct" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <IoGitCompareOutline className="size-4" />
        {t("button")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { code: sampleCode })}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("stage")}</span>
            <Select
              value={stageId}
              items={labelById}
              onValueChange={(value) => {
                setStageId(typeof value === "string" ? value : null);
                setConfirming(false);
              }}
            >
              <SelectTrigger className="w-full" aria-label={t("stage")}>
                <SelectValue placeholder={t("stagePlaceholder")}>
                  {(value) => (value ? (labelById[value as string] ?? "") : "")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {choices.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {labelById[stage.id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correct-stage-reason">{t("reason")}</Label>
            <Textarea
              id="correct-stage-reason"
              rows={3}
              maxLength={1000}
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setConfirming(false);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("reasonHint", { min: MIN_REASON })}</p>
          </div>

          {confirming && stageId ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t("confirmHint", { code: sampleCode, stage: labelById[stageId] ?? "" })}
            </p>
          ) : null}

          <InlineNotice tone="error">{error}</InlineNotice>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant={confirming ? "destructive" : "default"}
              className="gap-2"
              disabled={!ready || busy}
              onClick={() => (confirming ? void submit() : setConfirming(true))}
            >
              {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {confirming ? t("confirm") : t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
