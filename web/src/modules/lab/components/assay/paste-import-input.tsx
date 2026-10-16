"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import {
  IoCloudUploadOutline,
  IoDocumentAttachOutline,
  IoDocumentTextOutline,
  IoDownloadOutline,
  IoReloadOutline,
} from "react-icons/io5";

interface PasteImportInputProps {
  fileName: string | null;
  isDragging: boolean;
  isChecking: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onFile: (file: File | undefined) => Promise<void>;
  onDownloadTemplate: () => void;
}

/** The picker: the file's hidden input, wrapped in whatever is clicked to open it. */
function FilePicker({ onFile, className, children }: {
  onFile: (file: File | undefined) => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("assay.paste");
  return (
    <label className={cn("cursor-pointer", className)}>
      {children}
      <input
        type="file"
        aria-label={t("chooseFile")}
        accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain"
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
}

/** The steps, and the box a CSV or Excel file is chosen or dropped into. */
export function PasteImportInput({
  fileName,
  isDragging,
  isChecking,
  onDraggingChange,
  onDrop,
  onFile,
  onDownloadTemplate,
}: PasteImportInputProps) {
  const t = useTranslations("assay.paste");

  return (
    <>
      {/* What to do, in the order it is done. Gone once a file is read: by
          then the steps are done, and the room is the preview's. */}
      {fileName === null ? (
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          {[t("step1"), t("step2"), t("step3")].map((step, index) => (
            <li key={index} className="flex gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {index + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          onDraggingChange(true);
        }}
        onDragLeave={() => onDraggingChange(false)}
        onDrop={onDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed bg-background transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        {fileName === null ? (
          <FilePicker
            onFile={onFile}
            className="flex flex-col items-center gap-2 px-6 py-10 text-center hover:bg-muted/30"
          >
            {isChecking ? (
              <IoReloadOutline aria-hidden className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <IoCloudUploadOutline aria-hidden className="size-8 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{isChecking ? t("checking") : t("chooseFile")}</span>
            <span className="text-xs text-muted-foreground">{t("dropFile")}</span>
          </FilePicker>
        ) : (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <IoDocumentTextOutline aria-hidden className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm font-medium" title={fileName}>
              {fileName}
            </span>
            {isChecking ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <IoReloadOutline className="size-3.5 animate-spin" />
                {t("checking")}
              </span>
            ) : null}
            <FilePicker
              onFile={onFile}
              className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <IoDocumentAttachOutline className="size-3.5" />
              {t("changeFile")}
            </FilePicker>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed px-3 py-2 text-xs text-muted-foreground">
          <button type="button" onClick={onDownloadTemplate} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <IoDownloadOutline className="size-3.5" />
            {t("downloadTemplate")}
          </button>
          <span className="hidden sm:inline">{t("headerHint")}</span>
        </div>
      </div>
    </>
  );
}
