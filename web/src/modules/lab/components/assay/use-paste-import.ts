"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import type { ApiResult } from "@/core/types";
import type { ImportPreviewDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import {
  EXAMPLE_HEADER,
  PREVIEW_DELAY_MS,
  STATUS_ORDER,
  pastingElsewhere,
} from "@/modules/lab/components/assay/paste-import-utils";

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
    async (csv: string, apply: boolean, overwrite = false) => {
      const id = ++requestId.current;
      const response = await fetch(withBasePath("/api/lab-records/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, apply, overwrite, reason: t("auditReason") }),
      });
      const body: ApiResult<ImportPreviewDTO> & { code?: string } = await response.json();
      return { id, body };
    },
    [t]
  );

  return { requestIdRef: requestId, errorFor, send };
}

/**
 * Everything the import screen holds: the box, the preview that follows it,
 * and the save that writes it.
 */
export function usePasteImport() {
  const t = useTranslations("assay.paste");
  const tCommon = useTranslations("common");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  /** Set after a save, until somebody pastes again. */
  const [done, setDone] = useState<number | null>(null);
  /** Shown before saving a sheet that would replace results already there. */
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const { requestIdRef, errorFor, send } = useImportRequest();

  // The preview follows the box: paste, and it is checked a moment later.
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

  function replaceText(next: string) {
    setText(next);
    setDone(null);
    setConfirmOverwrite(false);
    if (next.trim() === "") {
      // A check still in flight belongs to text that is gone.
      requestIdRef.current += 1;
      setPreview(null);
      setError(null);
    }
  }

  /**
   * Ctrl+V anywhere on the page lands in the box. Pasting is what this page is
   * for, and having to find and click the box first is one step too many --
   * unless the paste is meant for some other field, which keeps it.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (pastingElsewhere(event.target, boxRef.current)) return;
      if (event.target === boxRef.current) return;
      const pasted = event.clipboardData?.getData("text/plain");
      if (!pasted) return;
      event.preventDefault();
      setText(pasted);
      setDone(null);
      boxRef.current?.focus();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  /**
   * A spreadsheet is read on the server; anything else is already text.
   *
   * The workbook comes back as the same tab-separated rows a paste would be
   * and lands in the same box, so the preview, the matching and the save all
   * stay on one path -- and whoever uploaded it can see what was read out
   * before anything is written.
   */
  async function readFile(file: File | undefined) {
    if (!file) return;

    if (!/\.xlsx$/i.test(file.name)) {
      replaceText(await file.text());
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
      replaceText(result.data.text);
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

  async function copyHeader() {
    try {
      await navigator.clipboard.writeText(EXAMPLE_HEADER);
      toast(t("headerCopied"));
    } catch {
      setError(t("headerCopyFailed", { header: EXAMPLE_HEADER.replaceAll("\t", ", ") }));
    }
  }

  const summary = preview?.summary;
  /** Rows a save writes: updates, and new sub-samples. */
  const writes = summary ? summary.update + (summary.create ?? 0) : 0;
  const canSave = Boolean(summary && writes > 0 && summary.invalid === 0 && !isChecking);

  const save = useCallback(
    async (overwrite = false) => {
      if (!canSave || isSaving) return;
      // Results already there are replaced only once that has been confirmed.
      if (!overwrite && (summary?.overwrite ?? 0) > 0) {
        setConfirmOverwrite(true);
        return;
      }
      setIsSaving(true);
      setError(null);
      try {
        const { body } = await send(text, true, overwrite);
        if (!body.success) {
          if (body.code === "overwrite") {
            setConfirmOverwrite(true);
            return;
          }
          setError(errorFor(body.code, body.error));
          return;
        }
        setDone(body.data.summary.update + (body.data.summary.create ?? 0));
        setConfirmOverwrite(false);
        setText("");
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
    return problemsOnly ? all.filter((row) => row.status === "invalid" || row.status === "unknown") : all;
  }, [preview, problemsOnly]);

  function pasteAnother() {
    setDone(null);
    requestAnimationFrame(() => boxRef.current?.focus());
  }

  return {
    text,
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
    boxRef,
    replaceText,
    readFile,
    handleDrop,
    copyHeader,
    summary,
    writes,
    canSave,
    save,
    rows,
    pasteAnother,
  };
}
