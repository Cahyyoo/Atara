"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { HistoryEntries } from "@/modules/lab/components/shared/history-entries";
import type { ApiResult } from "@/core/types";
import type { LabRecordListItemDTO, RecordHistoryEntry } from "@/modules/lab/types";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/**
 * One sample's result history, from its row in the table: every change,
 * newest first, its sub-samples' included and marked.
 */
export function RecordHistoryDialog({
  record,
  onClose,
}: {
  /** The row it was opened from; null while closed. */
  record: LabRecordListItemDTO | null;
  onClose: () => void;
}) {
  const t = useTranslations("history");
  const tCommon = useTranslations("common");
  const [loaded, setLoaded] = useState<{ id: string; entries: RecordHistoryEntry[] | null; error: string | null }>({
    id: "",
    entries: null,
    error: null,
  });

  useEffect(() => {
    if (!record) return;
    const controller = new AbortController();
    const id = record.id;
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/lab-records/${encodeURIComponent(id)}/history`), {
          signal: controller.signal,
        });
        const body: ApiResult<{ entries: RecordHistoryEntry[] }> = await response.json();
        setLoaded(
          body.success ? { id, entries: body.data.entries, error: null } : { id, entries: null, error: body.error }
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoaded({ id, entries: null, error: tCommon("networkError") });
      }
    })();
    return () => controller.abort();
  }, [record, tCommon]);

  const current = record && loaded.id === record.id ? loaded : null;
  const title = record
    ? record.parentId
      ? `${record.sample.sampleCode} · ${t("subLabel", { code: record.subCode ?? "" })}`
      : record.sample.sampleCode
    : "";

  return (
    <Dialog open={record !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { code: title })}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {record ? (record.sampleIdent ?? record.labCode) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 overflow-y-auto px-1">
          {current === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <IoReloadOutline aria-hidden className="size-4 animate-spin" />
              {tCommon("loading")}
            </p>
          ) : current.error ? (
            <InlineNotice tone="error">{current.error}</InlineNotice>
          ) : current.entries && current.entries.length > 0 ? (
            <HistoryEntries entries={current.entries} />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
