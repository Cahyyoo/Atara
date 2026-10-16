"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import type { ApiResult } from "@/core/types";
import type { ImportPreviewDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import { PREVIEW_DELAY_MS, STATUS_ORDER } from "@/modules/lab/components/assay/paste-import-utils";

/** The import endpoint, and its refusals in words. */
function useImportRequest() {
  const t = useTranslations("assay.paste");
  /** Only the answer to the latest paste counts; an older one arriving late is dropped. */
  const requestId = useRef(0);

  const errorFor = useCallback(
    (code: string | undefined, fallback: string) => {
      switch (code) {
        case "import-empty":
          return t("errors.empty");
        case "import-noKey":
          return t("errors.noKey");
        case "import-noFields":
          return t("errors.noFields");
        default:
          return fallback;
      }
    },
    [t]
  );

  const send = useCallback(
    async (csv: string, apply: boolean, confirmed = false) => {
      const id = ++requestId.current;
      // One confirmation covers both: replacing results, and saving look-alikes.
      const response = await fetch(withBasePath("/api/lab-records/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, apply, overwrite: confirmed, duplicates: confirmed, reason: t("auditReason") }),
      });
      const body: ApiResult<ImportPreviewDTO> & { code?: string } = await response.json();
      return { id, body };
    },
    [t]
  );

  return { requestIdRef: requestId, errorFor, send };
}

/**
 * Everything the import screen holds: the file read, the preview that follows
 * it, and the save that writes it.
 */
export function usePasteImport() {
  const tCommon = useTranslations("common");
  /** The file's rows as tab-separated text: what the import reads. */
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  /** Set after a save, until another file is chosen. */
  const [done, setDone] = useState<number | null>(null);
  /** Shown before saving a sheet that would replace results already there. */
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const { requestIdRef, errorFor, send } = useImportRequest();

  // The preview follows the file: chosen, and it is checked a moment later.
  useEffect(() => {
    if (text.trim() === "") return;
    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const { id, body } = await send(text, false);
        if (id !== requestIdRef.current) return;
        if (!body.success) {
          setPreview(null);
          setError(errorFor(body.code, body.error));
          return;
        }
        setError(null);
        setPreview(body.data);
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setIsChecking(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, send, errorFor, tCommon, requestIdRef]);

  function replaceText(next: string, name: string | null = null) {
    setText(next);
    setFileName(next.trim() === "" ? null : name);
    setDone(null);
    setConfirmOverwrite(false);
    if (next.trim() === "") {
      // A check still in flight belongs to a file that is gone.
      requestIdRef.current += 1;
      setPreview(null);
      setError(null);
    }
  }

  /**
   * A spreadsheet is read on the server; anything else is already text.
   *
   * The workbook comes back as tab-separated rows, as a CSV is read here, so
   * the preview, the matching and the save all stay on one path -- and
   * whoever uploaded it sees what was read out before anything is written.
   */
  async function readFile(file: File | undefined) {
    if (!file) return;

    if (!/\.xlsx$/i.test(file.name)) {
      replaceText(await file.text(), file.name);
      return;
    }

    setError(null);
    setIsChecking(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(withBasePath("/api/lab-records/import/sheet"), { method: "POST", body });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error ?? tCommon("networkError"));
        return;
      }
      replaceText(result.data.text, file.name);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsChecking(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  const summary = preview?.summary;
  /** Rows a save writes: updates, and new sub-samples. */
  const writes = summary ? summary.update + (summary.create ?? 0) : 0;
  const canSave = Boolean(summary && writes > 0 && summary.invalid === 0 && !isChecking);

  const save = useCallback(
    async (overwrite = false) => {
      if (!canSave || isSaving) return;
      // Results already there are replaced, and look-alikes saved, only once confirmed.
      if (!overwrite && ((summary?.overwrite ?? 0) > 0 || (summary?.duplicate ?? 0) > 0)) {
        setConfirmOverwrite(true);
        return;
      }
      setIsSaving(true);
      setError(null);
      try {
        const { body } = await send(text, true, overwrite);
        if (!body.success) {
          if (body.code === "overwrite" || body.code === "duplicate") {
            setConfirmOverwrite(true);
            return;
          }
          setError(errorFor(body.code, body.error));
          return;
        }
        setDone(body.data.summary.update + (body.data.summary.create ?? 0));
        setConfirmOverwrite(false);
        setText("");
        setFileName(null);
        setPreview(null);
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setIsSaving(false);
      }
    },
    [canSave, isSaving, summary, send, text, errorFor, tCommon]
  );

  // Ctrl+S saves here too, as on the manual grid.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const rows = useMemo(() => {
    const all = [...(preview?.rows ?? [])].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.line - b.line
    );
    return problemsOnly
      ? all.filter((row) => row.status === "invalid" || row.status === "unknown" || row.duplicateLines || row.duplicateOf)
      : all;
  }, [preview, problemsOnly]);

  function importAnother() {
    setDone(null);
  }

  return {
    text,
    fileName,
    preview,
    error,
    isChecking,
    isSaving,
    problemsOnly,
    setProblemsOnly,
    isDragging,
    setIsDragging,
    done,
    confirmOverwrite,
    setConfirmOverwrite,
    clear: () => replaceText(""),
    readFile,
    handleDrop,
    summary,
    writes,
    canSave,
    save,
    rows,
    importAnother,
  };
}
