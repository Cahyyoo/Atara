"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHECK_BATCH,
  checkText,
  lineOf,
  pendingLines,
  progressOf,
  pruneVerdicts,
  rememberVerdicts,
  sheetDuplicates,
  type Verdict,
} from "@/modules/lab/components/assay/paste-sheet/sheet-check";
import type { SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import type { ApiResult } from "@/core/types";
import type { ImportPreviewDTO } from "@/modules/lab/types";

type Send = (csv: string, signal: AbortSignal) => Promise<ApiResult<ImportPreviewDTO>>;

/** A pause after typing before a check; longer when a lot is waiting, so fast typing queues nothing. */
function delayFor(pending: number): number {
  return pending > 500 ? 800 : 400;
}

/**
 * The server's verdict on every row of the sheet, fetched only for rows whose
 * text it has not seen (sheet-check.ts), a thousand at a time.
 *
 * Each pass of the effect sends one batch. Its answer updates the cache, which
 * runs the effect again for the next batch straight away -- so progress shows
 * batch by batch, and an edit made meanwhile simply joins the queue. A check
 * overtaken by an edit is cancelled (AbortController), so the server is not
 * left working on an answer nobody will read.
 */
export function useSheetCheck({
  rows,
  keys,
  send,
  networkError,
}: {
  rows: SheetRow[];
  keys: string[];
  send: Send;
  networkError: string;
}) {
  const [cache, setCache] = useState<Map<string, Verdict>>(() => new Map());
  const [failure, setFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);
  // Set when a batch has just come back, so the next one goes without waiting.
  const continuing = useRef(false);

  useEffect(() => {
    const pending = pendingLines(rows, keys, cache);
    if (pending.length === 0) return;
    const batch = pending.slice(0, CHECK_BATCH);
    const controller = new AbortController();
    const delay = continuing.current ? 0 : delayFor(pending.length);
    continuing.current = false;

    const timer = setTimeout(async () => {
      try {
        const body = await send(checkText(keys, batch), controller.signal);
        if (controller.signal.aborted) return;
        if (!body.success) {
          setFailure({ rows, message: body.error });
          return;
        }
        continuing.current = true;
        setCache((previous) => {
          const next = new Map(previous);
          rememberVerdicts(next, batch, body.data.rows);
          // The last batch tidies up: verdicts for text no longer on the sheet go.
          if (pending.length <= CHECK_BATCH) pruneVerdicts(next, rows, keys);
          return next;
        });
      } catch {
        if (!controller.signal.aborted) setFailure({ rows, message: networkError });
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rows, keys, cache, send, networkError]);

  const duplicates = useMemo(() => sheetDuplicates(rows, keys, cache), [rows, keys, cache]);
  const progress = useMemo(() => progressOf(rows, keys, cache, duplicates), [rows, keys, cache, duplicates]);
  const error = failure && failure.rows === rows ? failure.message : null;
  const verdictFor = useCallback((row: SheetRow) => cache.get(lineOf(row, keys)), [cache, keys]);

  return {
    progress,
    error,
    verdictFor,
    /** The other rows on the sheet with exactly this row's results. */
    duplicatesFor: useCallback((row: SheetRow) => duplicates.get(row), [duplicates]),
    isChecking: progress.filled > progress.checked && error === null,
  };
}
