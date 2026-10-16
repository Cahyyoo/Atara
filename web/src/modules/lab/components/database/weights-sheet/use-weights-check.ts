"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { lineOf, type Verdict } from "@/modules/lab/components/assay/paste-sheet/sheet-check";
import { isFilledLine, type SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { WEIGHT_KEYS, WEIGHTS_SHEET_KEYS } from "@/modules/lab/lib/records/weights-paste";
import { parseNumber } from "@/core/lib/number-parse";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";
import type { ImportPreviewDTO, WeightsPasteResult, WeightsPreviewRow } from "@/modules/lab/types";

export const WEIGHTS_KEYS: string[] = [...WEIGHTS_SHEET_KEYS];

/** A weight box's problem before the server is asked: not a number, or below nothing. */
export function weightProblem(value: string): "notNumber" | "negative" | null {
  const text = value.trim();
  if (text === "") return null;
  const number = parseNumber(text);
  if (number === null) return "notNumber";
  return number < 0 ? "negative" : null;
}

/** Whether a row has anything in it. */
export const isFilledRow = (row: SheetRow) => isFilledLine(lineOf(row, WEIGHTS_KEYS));

/** A row as the weighings route reads it; blank weights left out, so the stored ones stay. */
export function requestRow(row: SheetRow, line: number) {
  const values = Object.fromEntries(
    WEIGHT_KEYS.flatMap((key) => {
      const value = parseNumber(row[key] ?? "");
      return value === null ? [] : [[key, value]];
    })
  );
  return { line, key: (row.sampleIdent ?? "").trim(), ...values };
}

/** Checks (`dryRun`) or saves rows through the weighings route. */
export async function sendWeights(dryRun: boolean, rows: ReturnType<typeof requestRow>[], signal?: AbortSignal) {
  const response = await fetch(withBasePath("/api/lab-records/weights"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, rows }),
    signal,
  });
  return (await response.json()) as ApiResult<WeightsPasteResult>;
}

/** A verdict as the grid paints it, with the record it found, so repeats on the sheet can be told apart. */
type WeightsVerdict = Verdict & { recordId?: string };

/** The weighings route's answer for a row, in the shape the paste sheet's grid already paints. */
function toVerdict(row: WeightsPreviewRow, ambiguousHint: string, notFoundHint: string): WeightsVerdict {
  const overwrites = WEIGHT_KEYS.flatMap((key) => {
    const from = row.from?.[key];
    const to = row.to?.[key] ?? null;
    return from != null && from !== to ? [{ field: key, from, to }] : [];
  });
  const missing = row.status === "unknown" || row.status === "ambiguous";
  return {
    labCode: row.record?.labCode ?? row.key,
    sampleCode: row.record?.sampleCode,
    status: row.status === "ambiguous" ? "unknown" : row.status,
    changes: {},
    overwrites: row.status === "update" ? overwrites : [],
    message: missing ? (row.status === "ambiguous" ? ambiguousHint : notFoundHint) : row.message,
    field: missing ? "sampleIdent" : undefined,
    recordId: row.record?.id,
  };
}

/**
 * The verdict on every row of the weighings sheet, checked by the server only
 * for rows whose text it has not seen -- kept by the row's text, as the
 * results sheet keeps them (sheet-check.ts) -- and counted the way the paste
 * summary counts.
 */
export function useWeightsCheck(rows: SheetRow[]) {
  const t = useTranslations("database.weights");
  const tCommon = useTranslations("common");
  const [cache, setCache] = useState<Map<string, WeightsVerdict>>(() => new Map());
  const [failure, setFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);

  /**
   * What is wrong with a row before the server is asked: a weight that is not
   * one, or weights with no Sample ID to put them on. Such a row is not sent.
   */
  const localVerdict = useCallback(
    (row: SheetRow): WeightsVerdict | null => {
      const bad = WEIGHT_KEYS.find((key) => weightProblem(row[key] ?? "") !== null);
      if (bad) {
        const message = t(weightProblem(row[bad] ?? "") === "negative" ? "negative" : "notNumber");
        return { labCode: "", status: "invalid", changes: {}, field: bad, message };
      }
      if ((row.sampleIdent ?? "").trim() === "") {
        return { labCode: "", status: "invalid", changes: {}, field: "sampleIdent", message: t("noSampleId") };
      }
      return null;
    },
    [t]
  );

  // The rows the server has not seen yet, one request for all of them (the
  // sheet never holds more than the route takes), a moment after the last edit.
  useEffect(() => {
    const pending = new Map<string, SheetRow>();
    for (const row of rows) {
      const line = lineOf(row, WEIGHTS_KEYS);
      if (isFilledLine(line) && !cache.has(line) && !localVerdict(row)) pending.set(line, row);
    }
    if (pending.size === 0) return;
    const batch = [...pending];
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const body = await sendWeights(true, batch.map(([, row], index) => requestRow(row, index + 1)), controller.signal);
        if (controller.signal.aborted) return;
        if (!body.success) {
          setFailure({ rows, message: body.error });
          return;
        }
        setCache((previous) => {
          const next = new Map(previous);
          for (const answer of body.data.rows) {
            const text = batch[answer.line - 1]?.[0];
            if (text !== undefined) next.set(text, toVerdict(answer, t("ambiguousHint"), t("notFoundHint")));
          }
          // Verdicts for text no longer on the sheet go, so the cache never outgrows it.
          const live = new Set(rows.map((row) => lineOf(row, WEIGHTS_KEYS)));
          for (const line of next.keys()) if (!live.has(line)) next.delete(line);
          return next;
        });
      } catch {
        if (!controller.signal.aborted) setFailure({ rows, message: tCommon("networkError") });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rows, cache, localVerdict, t, tCommon]);

  /**
   * Every filled row's verdict: its own problem first, then the server's. A
   * sample listed twice is worked out here, over the whole sheet -- the server
   * only ever sees the rows that changed.
   */
  const verdicts = useMemo(() => {
    const map = new Map<SheetRow, WeightsVerdict>();
    const seen = new Set<string>();
    for (const row of rows) {
      const line = lineOf(row, WEIGHTS_KEYS);
      if (!isFilledLine(line)) continue;
      const verdict = localVerdict(row) ?? cache.get(line);
      if (!verdict) continue;
      if (verdict.recordId && verdict.status !== "unknown") {
        if (seen.has(verdict.recordId)) {
          map.set(row, { ...verdict, status: "invalid", overwrites: [], field: "sampleIdent", message: t("listedTwice") });
          continue;
        }
        seen.add(verdict.recordId);
      }
      map.set(row, verdict);
    }
    return map;
  }, [rows, cache, localVerdict, t]);

  const progress = useMemo(() => {
    const summary: ImportPreviewDTO["summary"] = {
      total: 0, update: 0, create: 0, unchanged: 0, unknown: 0, invalid: 0, overwrite: 0, duplicate: 0,
    };
    let filled = 0;
    for (const row of rows) {
      if (!isFilledRow(row)) continue;
      filled++;
      const verdict = verdicts.get(row);
      if (!verdict) continue;
      summary.total++;
      summary[verdict.status]++;
      if ((verdict.overwrites?.length ?? 0) > 0) summary.overwrite++;
    }
    return { filled, checked: summary.total, summary: filled > 0 && summary.total === filled ? summary : null };
  }, [rows, verdicts]);

  const error = failure && failure.rows === rows ? failure.message : null;

  return {
    progress,
    error,
    isChecking: progress.filled > progress.checked && error === null,
    verdictFor: useCallback((row: SheetRow) => verdicts.get(row), [verdicts]),
    /** Forgets every verdict: after a save, the stored weights are not what they were. */
    forget: useCallback(() => {
      setCache(new Map());
      setFailure(null);
    }, []),
  };
}
