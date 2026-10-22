"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";
import { isActive, requestRows, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";
import type { DataSourceView, SheetResult, SheetStatus, SheetVerdict } from "@/modules/eksplorasi/types";

/** Checks (`dryRun`) or saves the sheet's active rows, for one list. */
export async function sendSheet(view: DataSourceView, rows: readonly SheetRow[], dryRun: boolean, signal?: AbortSignal) {
  const response = await fetch(withBasePath("/api/data-sources/sheet"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, view, rows: requestRows(rows) }),
    signal,
  });
  return (await response.json()) as ApiResult<SheetResult>;
}

/** Each sent row's verdict, kept by the row object it was given for: an edit makes a new object, and its verdict goes. */
export function verdictsByRow(rows: readonly SheetRow[], answer: readonly SheetVerdict[]): Map<SheetRow, SheetVerdict> {
  const byLine = new Map(answer.map((verdict) => [verdict.line, verdict]));
  const map = new Map<SheetRow, SheetVerdict>();
  rows.forEach((row, index) => {
    const verdict = byLine.get(index + 1);
    if (verdict && isActive(row)) map.set(row, verdict);
  });
  return map;
}

/**
 * The server's word on every active row, asked a moment after the last edit.
 * The whole set is sent each time -- a few hundred rows at most -- because one
 * row's verdict can turn on another's (the same sample ID twice). A check
 * overtaken by an edit is cancelled.
 */
export function useSheetCheck(view: DataSourceView, rows: SheetRow[], networkError: string) {
  const [verdicts, setVerdicts] = useState<Map<SheetRow, SheetVerdict>>(() => new Map());
  const [failure, setFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);

  useEffect(() => {
    if (!rows.some(isActive)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const body = await sendSheet(view, rows, true, controller.signal);
        if (controller.signal.aborted) return;
        if (!body.success) {
          setFailure({ rows, message: body.error });
          return;
        }
        setVerdicts(verdictsByRow(rows, body.data.rows));
      } catch {
        if (!controller.signal.aborted) setFailure({ rows, message: networkError });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [view, rows, networkError]);

  const progress = useMemo(() => {
    const summary: Record<SheetStatus, number> = { create: 0, update: 0, unchanged: 0, invalid: 0 };
    let active = 0;
    let checked = 0;
    for (const row of rows) {
      if (!isActive(row)) continue;
      active += 1;
      const verdict = verdicts.get(row);
      if (!verdict) continue;
      checked += 1;
      summary[verdict.status] += 1;
    }
    return { active, checked, summary: active > 0 && checked === active ? summary : null };
  }, [rows, verdicts]);

  const error = failure && failure.rows === rows ? failure.message : null;
  return {
    progress,
    error,
    isChecking: progress.active > progress.checked && error === null,
    verdictFor: useCallback((row: SheetRow) => verdicts.get(row), [verdicts]),
    /** Takes the verdicts a save came back with, when it was refused for a row. */
    remember: (sent: SheetRow[], answer: SheetVerdict[]) => setVerdicts(verdictsByRow(sent, answer)),
  };
}
