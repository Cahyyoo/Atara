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
import {
  EXPORT_CATALOGUES,
  EXPORT_STAGE_LAYOUT,
  STAGE_PARTS,
  defaultExportSelection,
  exportKeyOrder,
  stageColumnKey,
  type ExportColumnGroup,
  type ExportKind,
  type StagePart,
} from "@/lib/export-columns";
import { MasterFilter } from "@/components/shared/master-filter";
import { stageLabel } from "@/lib/stages";
import type { ApiResult, StageDTO } from "@/types";
import { IoDocumentTextOutline, IoDownloadOutline, IoGridOutline, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

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
}: {
  kind: ExportKind;
  onExport: (format: "xlsx" | "csv", columns: string[]) => void | Promise<void>;
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
  const tStages = useTranslations("stages");
  const catalogue = EXPORT_CATALOGUES[kind];
  const layout = EXPORT_STAGE_LAYOUT[kind];
  /** Columns that go with the stage dates, such as the lead time. */
  const stageExtras = catalogue.filter((column) => column.group === "stages");

  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<StageDTO[] | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

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

  const partLabel: Record<StagePart, string> = { at: t("entered"), duration: t("hours"), by: t("operator") };

  return (
    <>
      <Button data-tour={tourId} variant="outline" className="gap-2" onClick={() => void openDialog()}>
        <IoDownloadOutline className="size-4" />
        {tCommon("export")}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

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
            <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
              <legend className="text-sm font-medium">{t("stages")}</legend>
              {stages === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IoReloadOutline aria-hidden className="size-4 animate-spin" />
                  {tCommon("loading")}
                </p>
              ) : stages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noStages")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-normal">{t("stage")}</th>
                      {STAGE_PARTS.map((part) => {
                        const keys = stageIds.map((id) => stageColumnKey(id, part));
                        const all = keys.every((key) => chosen.has(key));
                        return (
                          <th key={part} className="py-1 text-center font-normal">
                            <label className="inline-flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={all}
                                aria-label={t("allOf", { part: partLabel[part] })}
                                onChange={() => toggle(keys, !all)}
                              />
                              {partLabel[part]}
                            </label>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((stage) => {
                      const name = stageLabel(tStages, stage.key, stage.name);
                      return (
                        <tr key={stage.id} className="border-t">
                          <td className="py-1.5">{name}</td>
                          {STAGE_PARTS.map((part) => {
                            const key = stageColumnKey(stage.id, part);
                            return (
                              <td key={part} className="py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary"
                                  aria-label={`${partLabel[part]} ${name}`}
                                  checked={chosen.has(key)}
                                  onChange={(event) => toggle([key], event.target.checked)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {stageExtras.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-2">
                  {stageExtras.map((column) => (
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
              ) : null}
            </fieldset>
          </div>

          <DialogFooter className="gap-2 sm:items-center">
            <span className="text-sm text-muted-foreground sm:mr-auto">{t("chosen", { count })}</span>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || stages === null}
              onClick={() => setChosen(new Set(defaultExportSelection(catalogue, stageIds, layout.defaultParts)))}
            >
              {t("reset")}
            </Button>
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
