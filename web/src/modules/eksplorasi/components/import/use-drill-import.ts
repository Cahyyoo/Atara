"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import { apiFetch, readNdjson } from "@/core/lib/http/api-client";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ImportError } from "@/modules/eksplorasi/lib/drill-hole-import";

/** What the server says a file would do, before anything is written. */
export interface ImportPreview {
  total: number;
  valid: number;
  create: number;
  existing: number;
  invalid: number;
  errors: ImportError[];
  errorsTotal: number;
  ignoredHeaders: string[];
}

export interface ImportDone {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
}

export type ImportStep =
  | { kind: "pick" }
  | { kind: "previewing" }
  | { kind: "preview"; preview: ImportPreview }
  | { kind: "importing"; preview: ImportPreview; done: number; total: number }
  | { kind: "done"; result: ImportDone };

/**
 * The import's flow, apart from how it looks: choose a file and have it
 * checked (a preview), then write it with progress read off the NDJSON
 * answer. The same file is sent both times; nothing is kept between them.
 */
export function useDrillImport(onImported: () => void) {
  const t = useTranslations("drilling.import");
  const tCommon = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [step, setStep] = useState<ImportStep>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  const busy = step.kind === "previewing" || step.kind === "importing";
  const preview = step.kind === "preview" || step.kind === "importing" ? step.preview : null;
  const writes = preview ? preview.create + (updateExisting ? preview.existing : 0) : 0;

  function formFor(chosen: File, apply: boolean) {
    const form = new FormData();
    form.set("file", chosen);
    form.set("apply", apply ? "1" : "0");
    form.set("updateExisting", updateExisting ? "1" : "0");
    return form;
  }

  function reset() {
    setFile(null);
    setUpdateExisting(false);
    setStep({ kind: "pick" });
    setError(null);
  }

  async function choose(chosen: File | null) {
    setFile(chosen);
    if (!chosen) return;
    setError(null);
    setStep({ kind: "previewing" });
    const outcome = await apiFetch<ImportPreview>("/api/drill-holes/import", {
      method: "POST",
      body: formFor(chosen, false),
      networkError: tCommon("networkError"),
    });
    if (!outcome.ok) {
      setError(outcome.error);
      setStep({ kind: "pick" });
      return;
    }
    setStep({ kind: "preview", preview: outcome.data });
  }

  async function run() {
    if (!file || !preview) return;
    const previewed = preview;
    setError(null);
    setStep({ kind: "importing", preview: previewed, done: 0, total: writes });
    let finished: ImportDone | null = null;
    try {
      const response = await fetch(withBasePath("/api/drill-holes/import"), { method: "POST", body: formFor(file, true) });
      // A refusal before the write starts is an ordinary JSON error.
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => null);
        setError(result?.error ?? tCommon("networkError"));
      } else {
        await readNdjson(response, (event) => {
          if (event.phase === "write") {
            setStep({ kind: "importing", preview: previewed, done: event.done as number, total: event.total as number });
          } else if (event.phase === "done") {
            finished = event as unknown as ImportDone;
          } else if (event.phase === "error") {
            setError(event.message as string);
          }
        });
      }
    } catch {
      setError(tCommon("networkError"));
    }

    const result = finished as ImportDone | null;
    if (result) {
      setStep({ kind: "done", result });
      toast(t("doneToast", { created: result.created, updated: result.updated }));
    } else {
      setStep({ kind: "preview", preview: previewed });
    }
    // Whatever was written is on the list now, finished or not.
    onImported();
  }

  return { file, step, error, setError, busy, preview, writes, updateExisting, setUpdateExisting, choose, run, reset };
}
