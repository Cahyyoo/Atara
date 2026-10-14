"use client";

import { useState } from "react";
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
import {
  EXPORT_CATALOGUES,
  EXPORT_STAGE_LAYOUT,
  defaultExportSelection,
  exportKeyOrder,
  type ExportColumnGroup,
  type ExportKind,
} from "@/modules/lab/lib/records/export-columns";
import { MasterFilter } from "@/modules/lab/components/shared/master-filter";
import { StageColumns } from "@/modules/lab/components/shared/export-stage-columns";
import {
  ExportPreviewPanel,
  useExportPreview,
  type ExportPreviewResult,
} from "@/modules/lab/components/shared/export-preview";
import type { ApiResult } from "@/core/types";
import type { StageDTO } from "@/modules/lab/types";
import {
  IoArrowBack,
  IoDocumentTextOutline,
  IoDownloadOutline,
  IoEyeOutline,
  IoGridOutline,
  IoReloadOutline,
} from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";
import { cn } from "@/core/lib/utils";

export type { ExportPreview, ExportPreviewResult } from "@/modules/lab/components/shared/export-preview";

const GROUPS: ExportColumnGroup[] = ["sample", "results", "instrument", "mc", "identity", "other"];

/**
 * The last choice, per export, so the next one starts where this one left
 * off. Versioned: the Sample Database export became the analysis form, and a
 * choice saved for the old sheet would hide most of it.
 */
function storageKey(kind: ExportKind) {
  return `atara.export-columns.v2.${kind}`;
}
function readStored(kind: ExportKind): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.every((key) => typeof key === "string") ? parsed : null;
  } catch {
    return null;
  }
}
function writeStored(kind: ExportKind, keys: string[]) {
  try {
    window.localStorage.setItem(storageKey(kind), JSON.stringify(keys));
  } catch {
    // A private window: the choice is simply not remembered.
  }
}

/**
 * Export, with the columns chosen first: whole groups or single columns, and
 * for every stage when the sample entered it, how long it stayed and who
 * scanned it. The choice is remembered for next time.
 */
export function ExportDialog({
  kind,
  onExport,
  option,
  place,
  tourId,
  onPreview,
}: {
  kind: ExportKind;
  onExport: (format: "xlsx" | "csv", columns: string[]) => void | Promise<void>;
  /** The file's first rows, to look at before downloading. */
  onPreview?: (columns: string[]) => Promise<ExportPreviewResult>;
  /** A choice about which rows go in, such as the sub-samples. */
  option?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
  /**
   * Which place the file covers -- one, or all of them. The analysis form
   * reports a place per sheet, so this is the choice that decides the sheets.
   */
  place?: { value: string; onChange: (optionId: string | null) => void };
  tourId?: string;
}) {
  const t = useTranslations("exportDialog");
  const tCommon = useTranslations("common");
  const catalogue = EXPORT_CATALOGUES[kind];
  const layout = EXPORT_STAGE_LAYOUT[kind];
  /** Columns that go with the stage dates, such as the lead time. */
  const stageExtras = catalogue.filter((column) => column.group === "stages");

  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<StageDTO[] | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  /** Null while the columns are being chosen; set, the preview is shown instead. */
  const { preview, show: showPreview, back: backToColumns } = useExportPreview(onPreview);

  const stageIds = (stages ?? []).map((stage) => stage.id);
  const order = exportKeyOrder(catalogue, stageIds, layout);
  const known = new Set(order);
  const count = [...chosen].filter((key) => known.has(key)).length;

  /** Opens on the last choice, or on the default the first time. */
  function start(loaded: StageDTO[]) {
    const ids = loaded.map((stage) => stage.id);
    setChosen(new Set(readStored(kind) ?? defaultExportSelection(catalogue, ids, layout.defaultParts)));
  }

  async function openDialog() {
    setOpen(true);
    backToColumns();
    if (stages) {
      start(stages);
      return;
    }
    let loaded: StageDTO[] = [];
    try {
      const response = await fetch(withBasePath("/api/stages"));
      const body: ApiResult<StageDTO[]> = await response.json();
      if (body.success) loaded = body.data;
    } catch {
      // Without the stages there are simply no stage columns to offer.
    }
    setStages(loaded);
    start(loaded);
  }

  function toggle(keys: string[], on: boolean) {
    setChosen((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function previewChosen() {
    const columns = order.filter((key) => chosen.has(key));
    writeStored(kind, columns);
    void showPreview(columns);
  }

  async function download(format: "xlsx" | "csv") {
    const columns = order.filter((key) => chosen.has(key));
    writeStored(kind, columns);
    setBusy(true);
    try {
      await onExport(format, columns);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button data-tour={tourId} variant="outline" className="gap-2" onClick={() => void openDialog()}>
        <IoDownloadOutline className="size-4" />
        {tCommon("export")}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent className={cn("max-h-[90vh]", preview ? "sm:max-w-5xl" : "sm:max-w-3xl")}>
          <DialogHeader>
            <DialogTitle>{preview ? t("previewTitle") : t("title")}</DialogTitle>
            <DialogDescription>
              {preview?.status === "ready"
                ? t("previewShowing", { shown: preview.data.rows.length, total: preview.data.total })
                : t("description")}
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <ExportPreviewPanel state={preview} />
          ) : (
          <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
            {place || option ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {place ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span>{t("place")}</span>
                    <MasterFilter
                      kind="PLACE"
                      value={place.value}
                      onChange={place.onChange}
                      className="w-44"
                    />
                  </div>
                ) : null}
                {option ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={option.checked}
                      onChange={(event) => option.onChange(event.target.checked)}
                    />
                    {option.label}
                  </label>
                ) : null}
              </div>
            ) : null}

            {GROUPS.map((group) => {
              const columns = catalogue.filter((column) => column.group === group);
              if (columns.length === 0) return null;
              const keys = columns.map((column) => column.key);
              return (
                <fieldset key={group} className="flex flex-col gap-2 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <legend className="text-sm font-medium">{t(`groups.${group}`)}</legend>
                    <div className="ml-auto flex gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => toggle(keys, true)}>
                        {t("all")}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => toggle(keys, false)}>
                        {t("none")}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                    {columns.map((column) => (
                      <label key={column.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={chosen.has(column.key)}
                          onChange={(event) => toggle([column.key], event.target.checked)}
                        />
                        {column.header}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}

            {/* Each stage: when it was entered, how long the sample stayed, who scanned it. */}
            <StageColumns stages={stages} extras={stageExtras} chosen={chosen} onToggle={toggle} />
          </div>
          )}

          <DialogFooter className="gap-2 sm:items-center">
            {preview ? (
              <Button type="button" variant="ghost" className="gap-2 sm:mr-auto" disabled={busy} onClick={backToColumns}>
                <IoArrowBack className="size-4" />
                {t("backToColumns")}
              </Button>
            ) : (
              <>
                <span className="text-sm text-muted-foreground sm:mr-auto">{t("chosen", { count })}</span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || stages === null}
                  onClick={() => setChosen(new Set(defaultExportSelection(catalogue, stageIds, layout.defaultParts)))}
                >
                  {t("reset")}
                </Button>
                {onPreview ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={busy || count === 0}
                    onClick={previewChosen}
                  >
                    <IoEyeOutline className="size-4" />
                    {t("preview")}
                  </Button>
                ) : null}
              </>
            )}
            <Button type="button" variant="outline" className="gap-2" disabled={busy || count === 0} onClick={() => void download("csv")}>
              <IoDocumentTextOutline className="size-4" />
              {t("csv")}
            </Button>
            <Button type="button" className="gap-2" disabled={busy || count === 0} onClick={() => void download("xlsx")}>
              {busy ? <IoReloadOutline className="size-4 animate-spin" /> : <IoGridOutline className="size-4" />}
              {t("excel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

