"use client";

import { useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { downloadFromApi } from "@/core/lib/http/download";
import { DRILL_HOLE_COLUMNS } from "@/modules/eksplorasi/lib/drill-hole-columns";
import { IoCloudUploadOutline, IoDocumentOutline } from "react-icons/io5";

/** Step 1: the file, the columns it may have, and the templates to start from. */
export function ImportFilePicker({
  file,
  disabled,
  onChoose,
  onError,
}: {
  file: File | null;
  disabled: boolean;
  onChoose: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("drilling.import");
  const format = useFormatter();
  const input = useRef<HTMLInputElement>(null);

  async function template(fileFormat: "xlsx" | "csv") {
    const failure = await downloadFromApi(`/api/drill-holes/template?format=${fileFormat}`, `drill-holes-template.${fileFormat}`);
    if (failure) onError(failure);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv"
        className="sr-only"
        id="drill-import-file"
        disabled={disabled}
        onChange={(event) => {
          onChoose(event.target.files?.[0] ?? null);
          // The same file may be chosen again after fixing it.
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="gap-2" disabled={disabled} onClick={() => input.current?.click()}>
          <IoCloudUploadOutline className="size-4" />
          {file ? t("chooseAnother") : t("choose")}
        </Button>
        {file ? (
          <span className="flex min-w-0 items-center gap-1.5 text-sm">
            <IoDocumentOutline className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">
              ({format.number(file.size / 1024 / 1024, { maximumFractionDigits: 1 })} MB)
            </span>
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("columnsHint", { columns: DRILL_HOLE_COLUMNS.map((c) => c.header).join(", ") })}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">{t("template")}:</span>
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => void template("xlsx")}>
          Excel (.xlsx)
        </button>
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => void template("csv")}>
          CSV
        </button>
      </div>
    </div>
  );
}
