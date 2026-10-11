"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { WEIGHT_KEYS, parseWeightsPaste, type WeightKey } from "@/lib/weights-paste";
import type { ApiResult, WeightsPasteResult, WeightsPreviewRow } from "@/types";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

const STATUS_TONE: Record<WeightsPreviewRow["status"], string> = {
  update: "text-primary",
  unchanged: "text-muted-foreground",
  unknown: "text-destructive",
  ambiguous: "text-destructive",
  invalid: "text-destructive",
};

function weight(value: number | null | undefined): string {
  return value == null ? "—" : String(value);
}

/**
 * Wp, W0 and Wd for many samples at once, pasted from a sheet by Sample ID.
 * The optional alternative to the record dialog: checked on the server first,
 * then saved -- only the rows that change something.
 */
export function PasteWeightsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("database.weights");
  const tDatabase = useTranslations("database");
  const tCommon = useTranslations("common");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<WeightsPasteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setText("");
    setPreview(null);
    setError(null);
  }

  async function send(dryRun: boolean) {
    const parsed = parseWeightsPaste(text);
    const unreadable = parsed.rows.find((row) => row.error);
    if (parsed.rows.length === 0) {
      setError(t("empty"));
      return;
    }
    if (unreadable) {
      setError(t("unreadable", { line: unreadable.line, reason: unreadable.error ?? "" }));
      return;
    }
    if (parsed.rows.length > 500) {
      setError(t("tooMany"));
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const response = await fetch(withBasePath("/api/lab-records/weights"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          rows: parsed.rows.map((row) => ({ line: row.line, key: row.key, ...row.values })),
        }),
      });
      const result: ApiResult<WeightsPasteResult> = await response.json();
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (dryRun) {
        setPreview(result.data);
        return;
      }
      toast(t("saved", { count: result.data.saved }));
      onSaved();
      reset();
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="flex min-h-0 flex-col gap-3">
            <p className="text-sm">
              {t("summary", {
                update: preview.summary.update,
                unchanged: preview.summary.unchanged,
                unknown: preview.summary.unknown,
                invalid: preview.summary.invalid,
              })}
            </p>
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">{t("line")}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{tDatabase("sampleIdent")}</th>
                    {WEIGHT_KEYS.map((key) => (
                      <th key={key} className="px-2 py-1.5 text-right font-medium">
                        {key === "w0" ? "W0" : key === "wp" ? "Wp" : "Wd"}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right font-medium">MC</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.line} className="border-t">
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{row.line}</td>
                      <td className="max-w-64 truncate px-2 py-1.5 font-mono text-xs" title={row.key}>
                        {row.record?.sampleIdent ?? row.key}
                      </td>
                      {WEIGHT_KEYS.map((key: WeightKey) => {
                        const from = row.from?.[key];
                        const to = row.to?.[key];
                        const changed = row.from !== undefined && from !== to;
                        return (
                          <td key={key} className="px-2 py-1.5 text-right tabular-nums">
                            {changed ? (
                              <>
                                <span className="text-muted-foreground line-through">{weight(from)}</span>{" "}
                                <span className="font-medium">{weight(to)}</span>
                              </>
                            ) : (
                              weight(to)
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {row.mc == null ? "—" : row.mc.toFixed(2)}
                      </td>
                      <td className={cn("px-2 py-1.5 text-xs", STATUS_TONE[row.status])}>
                        {t(`statuses.${row.status}`)}
                        {row.message ? <span className="block text-muted-foreground">{row.message}</span> : null}
                        {row.status === "unknown" || row.status === "ambiguous" ? (
                          <span className="block text-muted-foreground">
                            {t(row.status === "unknown" ? "notFoundHint" : "ambiguousHint")}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weights-paste-text">{t("label")}</Label>
            <Textarea
              id="weights-paste-text"
              rows={10}
              className="font-mono text-xs"
              placeholder={"Sample ID\tWp\tW0\tWd\nMOL SAP SA4/PA11/B78/779.1\t564.5\t3131.5\t2276.0"}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>
        )}

        <InlineNotice tone="error">{error}</InlineNotice>

        <DialogFooter>
          {preview ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)}>
              {t("back")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              {tCommon("cancel")}
            </Button>
          )}
          {preview ? (
            <Button
              type="button"
              className="gap-2"
              disabled={busy || preview.summary.update === 0}
              onClick={() => void send(false)}
            >
              {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {t("save", { count: preview.summary.update })}
            </Button>
          ) : (
            <Button type="button" className="gap-2" disabled={busy || text.trim() === ""} onClick={() => void send(true)}>
              {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {t("check")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
