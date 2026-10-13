"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/core/components/ui/textarea";
import { cn } from "@/core/lib/utils";
import {
  IoCopyOutline,
  IoDocumentAttachOutline,
  IoDownloadOutline,
  IoReloadOutline,
} from "react-icons/io5";

interface PasteImportInputProps {
  text: string;
  hasPreview: boolean;
  isDragging: boolean;
  isChecking: boolean;
  boxRef: RefObject<HTMLTextAreaElement | null>;
  onDraggingChange: (dragging: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onTextChange: (next: string) => void;
  onFile: (file: File | undefined) => Promise<void>;
  onCopyHeader: () => void;
  onDownloadTemplate: () => void;
}

/** The steps, and the box a sheet is pasted or dropped into. */
export function PasteImportInput({
  text,
  hasPreview,
  isDragging,
  isChecking,
  boxRef,
  onDraggingChange,
  onDrop,
  onTextChange,
  onFile,
  onCopyHeader,
  onDownloadTemplate,
}: PasteImportInputProps) {
  const t = useTranslations("assay.paste");

  return (
    <>
      {/* What to do, in the order it is done. Numbered because the first step
          happens in another program, and it is easy to start at the second.
          Gone once something is pasted: by then the steps are done, and the
          room is the preview's. */}
      {text.trim() === "" ? (
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
        <Textarea
          ref={boxRef}
          aria-label={t("boxLabel")}
          placeholder={t("placeholder")}
          wrap="off"
          autoFocus
          // Smaller once there is a preview to read under it: the pasted text
          // has done its job, and the rows being checked matter more.
          className={cn(
            "resize-y overflow-auto border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0",
            hasPreview ? "h-24 min-h-24" : "h-40 min-h-40"
          )}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed px-3 py-2 text-xs text-muted-foreground">
          <label className="inline-flex cursor-pointer items-center gap-1.5 hover:text-foreground">
            <IoDocumentAttachOutline className="size-3.5" />
            {t("chooseFile")}
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain"
              className="sr-only"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" onClick={onCopyHeader} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <IoCopyOutline className="size-3.5" />
            {t("copyHeader")}
          </button>
          {/* The whole sheet rather than just its first row, for anyone who
              would rather start from a file than paste a heading in. */}
          <button
            type="button"
            onClick={onDownloadTemplate}
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <IoDownloadOutline className="size-3.5" />
            {t("downloadTemplate")}
          </button>
          <span className="hidden sm:inline">{t("headerHint")}</span>
          {isChecking ? (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <IoReloadOutline className="size-3.5 animate-spin" />
              {t("checking")}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
