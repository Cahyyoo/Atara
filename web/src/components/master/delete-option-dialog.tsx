"use client";

import { useState } from "react";
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
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import type { ApiResult, MasterOptionDTO } from "@/types";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

interface Preview {
  affected: number;
  examples: { labCode: string; from: string | null; to: string | null }[];
  clashes: string[];
}

interface Deleted {
  deleted: string;
  moved: number;
  replacement: string | null;
}

/**
 * Deleting a code.
 *
 * One nothing uses just goes, after one confirmation. One inside Sample IDs
 * needs a replacement from the same list first: choosing it shows how many
 * records move and what their Sample IDs become, or which ones would clash
 * with a sample that already has that id -- and only then can it be confirmed.
 */
export function DeleteOptionDialog({
  target,
  siblings,
  onClose,
  onDeleted,
}: {
  target: MasterOptionDTO | null;
  /** The other codes in the same list; the active ones are the replacements offered. */
  siblings: MasterOptionDTO[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("masterData.delete");
  const tCommon = useTranslations("common");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usage = target?.usageCount ?? 0;
  const candidates = siblings.filter((option) => option.isActive && option.id !== target?.id);
  const codeById = Object.fromEntries(candidates.map((option) => [option.id, option.code]));
  const replacementCode = replacementId ? codeById[replacementId] : null;

  function close() {
    if (busy) return;
    setReplacementId(null);
    setPreview(null);
    setConfirming(false);
    setError(null);
    onClose();
  }

  async function send(body: { replacementId?: string; dryRun?: boolean }) {
    const response = await fetch(withBasePath(`/api/master-options/${target!.id}`), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async function choose(id: string) {
    setReplacementId(id);
    setPreview(null);
    setConfirming(false);
    setError(null);
    setIsPreviewing(true);
    try {
      const result: ApiResult<Preview> = await send({ replacementId: id, dryRun: true });
      if (!result.success) {
        setError(result.error || tCommon("networkError"));
        return;
      }
      setPreview(result.data);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function remove() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const result: ApiResult<Deleted> = await send(
        usage > 0 && replacementId ? { replacementId } : {}
      );
      if (!result.success) {
        setError(result.error || tCommon("networkError"));
        return;
      }
      toast(
        result.data.replacement
          ? t("doneMoved", {
              code: result.data.deleted,
              count: result.data.moved,
              replacement: result.data.replacement,
            })
          : t("done", { code: result.data.deleted })
      );
      setBusy(false);
      onDeleted();
      close();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  const ready = usage === 0 || (preview !== null && preview.clashes.length === 0);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("title", { code: target.code })}</DialogTitle>
              <DialogDescription>
                {usage === 0 ? t("unusedBody") : t("usedBody", { code: target.code, count: usage })}
              </DialogDescription>
            </DialogHeader>

            {usage > 0 ? (
              candidates.length === 0 ? (
                <InlineNotice tone="error">{t("noReplacement")}</InlineNotice>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t("chooseReplacement")}</span>
                  <Select
                    value={replacementId}
                    items={codeById}
                    onValueChange={(value) => {
                      if (typeof value === "string") void choose(value);
                    }}
                  >
                    <SelectTrigger className="w-full font-mono" aria-label={t("chooseReplacement")}>
                      <SelectValue placeholder={t("chooseReplacement")}>
                        {(value) => (value ? (codeById[value as string] ?? "") : "")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((option) => (
                        <SelectItem key={option.id} value={option.id} className="font-mono">
                          {option.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            ) : null}

            {isPreviewing ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <IoReloadOutline aria-hidden className="size-4 animate-spin" />
                {tCommon("loading")}
              </p>
            ) : null}

            {preview && preview.clashes.length > 0 ? (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p className="font-medium">
                  {t("clashTitle", { count: preview.clashes.length, replacement: replacementCode ?? "" })}
                </p>
                <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-xs">
                  {preview.clashes.map((ident) => (
                    <li key={ident}>{ident}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">{t("clashHint")}</p>
              </div>
            ) : null}

            {preview && preview.clashes.length === 0 ? (
              <div className="flex flex-col gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-sm">
                <p>
                  {t("preview", {
                    count: preview.affected,
                    code: target.code,
                    replacement: replacementCode ?? "",
                  })}
                </p>
                {preview.examples.length > 0 ? (
                  <ul className="flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
                    {preview.examples.map((example) => (
                      <li key={example.labCode} className="break-all">
                        <span className="line-through">{example.from ?? "—"}</span> →{" "}
                        <span className="text-foreground">{example.to ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {confirming ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t("cannotUndo")}
              </p>
            ) : null}

            <InlineNotice tone="error">{error}</InlineNotice>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                disabled={!ready || busy || isPreviewing}
                onClick={() => (confirming ? void remove() : setConfirming(true))}
              >
                {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {!confirming
                  ? usage > 0
                    ? t("replaceAndDelete")
                    : t("button")
                  : usage > 0
                    ? t("confirmUsed", {
                        count: preview?.affected ?? usage,
                        code: target.code,
                        replacement: replacementCode ?? "",
                      })
                    : t("confirm", { code: target.code })}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
