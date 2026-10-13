"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { detectDelimiter, parseCsv } from "@/core/lib/sheets/csv-parse";
import { mapPastedRows, pastedKeys, type PasteRow, type PasteTarget } from "@/modules/lab/lib/records/paste-map";
import type { Overwrite } from "@/modules/lab/lib/records/overwrite";
import type { ApiResult } from "@/core/types";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import {
  MAX_KEYS,
  MAX_ROWS,
  RESOLVE_DEBOUNCE_MS,
  payload,
  toTarget,
  type OverwriteEntry,
  type Resolution,
} from "@/modules/lab/components/shared/paste-from-excel-utils";

interface UsePasteFromExcelOptions {
  records: LabRecordListItemDTO[];
  onClose: () => void;
  onApplied: () => void;
  onFill?: (rows: PasteRow[]) => void;
}

/** The paste dialog's state: the box, the look-up, the mapped preview and the save. */
export function usePasteFromExcel({ records, onClose, onApplied, onFill }: UsePasteFromExcelOptions) {
  const t = useTranslations("database.paste");
  const tCommon = useTranslations("common");

  const [text, setText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set while the operator decides about results that would be replaced. */
  const [confirm, setConfirm] = useState<OverwriteEntry[] | null>(null);

  /** Nothing ticked: the sheet names its own records. */
  const free = records.length === 0 && !onFill;
  const ticked = useMemo(() => records.map(toTarget), [records]);

  const parsed = useMemo(() => (text.trim() === "" ? null : parseCsv(text, detectDelimiter(text))), [text]);
  const keys = useMemo(() => (free && parsed ? pastedKeys(parsed) : null), [free, parsed]);
  const lookupKey = keys ? keys.keys.join("\n") : "";

  // The pasted Sample IDs, looked up across every record once typing pauses.
  const [lookup, setLookup] = useState<{
    key: string;
    targets: PasteTarget[] | null;
    /** Sample IDs that fit more than one sample once the sack count is left out. */
    ambiguous: string[];
    error: string | null;
  }>({ key: "", targets: null, ambiguous: [], error: null });
  useEffect(() => {
    if (!free || !keys || keys.keys.length === 0 || keys.keys.length > MAX_KEYS) return;
    const controller = new AbortController();
    const key = lookupKey;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(withBasePath("/api/lab-records/resolve"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: keys.keys }),
          signal: controller.signal,
        });
        const body: ApiResult<{ results: Resolution[] }> = await response.json();
        if (!body.success) {
          setLookup({ key, targets: null, ambiguous: [], error: body.error });
          return;
        }
        // The records found, and the parents of the sub-samples still to make.
        const byId = new Map<string, PasteTarget>();
        for (const entry of body.data.results) {
          if (entry.status === "found") byId.set(entry.record.id, toTarget(entry.record));
          if (entry.status === "newSub") byId.set(entry.parent.id, toTarget(entry.parent));
        }
        const ambiguous = body.data.results.flatMap((entry) => (entry.status === "ambiguous" ? [entry.key] : []));
        setLookup({ key, targets: [...byId.values()], ambiguous, error: null });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLookup({ key, targets: null, ambiguous: [], error: tCommon("networkError") });
      }
    }, RESOLVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [free, keys, lookupKey, tCommon]);

  const freeTargets = lookup.key === lookupKey ? lookup.targets : null;
  const freeProblem: "needKey" | "tooManyKeys" | null =
    free && parsed ? (!keys ? "needKey" : keys.keys.length > MAX_KEYS ? "tooManyKeys" : null) : null;
  const resolving = free && parsed !== null && freeProblem === null && freeTargets === null && !lookup.error;

  // Re-read on every keystroke: the block is at most a couple of hundred rows,
  // and a preview that lags behind the box is worse than one that is recomputed.
  const result = useMemo(() => {
    if (!parsed) return null;
    if (free) {
      return freeTargets
        ? mapPastedRows(parsed, freeTargets, new Date(), { scope: "all", ambiguous: lookup.ambiguous })
        : null;
    }
    // Filling the grid writes into rows that exist: no sub-sample is made there.
    return mapPastedRows(parsed, ticked, new Date(), { subs: !onFill });
  }, [parsed, free, freeTargets, lookup.ambiguous, ticked, onFill]);

  const toSave = result?.rows.filter((row) => row.status === "update" || row.status === "create") ?? [];

  const tooMany = toSave.length > MAX_ROWS;
  const canApply =
    result !== null &&
    result.blocker === null &&
    result.summary.invalid === 0 &&
    // An unknown row blocks the whole paste, ticked or not: a sheet that
    // half-lands is harder to put right than one that does not land at all.
    result.summary.unknown === 0 &&
    toSave.length > 0 &&
    !tooMany;

  /** What a save would replace, as the rows found it. */
  const localOverwrites: OverwriteEntry[] = toSave.flatMap((row) =>
    row.overwrites?.length ? [{ targetId: row.targetId, label: row.label, fields: row.overwrites }] : []
  );

  async function save(mode: "overwrite" | "keep" | "plain") {
    setIsBusy(true);
    setError(null);
    const keep = mode === "keep" ? (confirm ?? localOverwrites) : null;
    const records = payload(toSave, keep);
    if (records.length === 0) {
      setIsBusy(false);
      setConfirm(null);
      setError(t("nothingLeft"));
      return;
    }

    try {
      const response = await fetch(withBasePath("/api/lab-records/bulk"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, reason: t("auditReason"), overwrite: mode === "overwrite" }),
      });
      const body: ApiResult<{ updated: number }> = await response.json();

      if (!body.success) {
        // Someone filled these in since the preview was read: ask again, with
        // what the server found.
        if (body.code === "overwrite") {
          const details = body.details as {
            overwrites?: { id: string; labCode: string; sampleIdent: string | null; fields: Overwrite[] }[];
          };
          setConfirm(
            (details.overwrites ?? []).map((entry) => ({
              targetId: entry.id,
              label: entry.sampleIdent ?? entry.labCode,
              fields: entry.fields,
            }))
          );
          return;
        }
        setError(body.error);
        return;
      }

      setText("");
      setConfirm(null);
      onApplied();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsBusy(false);
    }
  }

  function apply() {
    // Filling is the caller's business and cannot fail on the network; the
    // grid asks about replaced results itself, when it is saved.
    if (onFill) {
      onFill(toSave);
      setText("");
      onClose();
      return;
    }
    if (localOverwrites.length > 0) {
      setConfirm(localOverwrites);
      return;
    }
    void save("plain");
  }

  function close() {
    setText("");
    setError(null);
    setConfirm(null);
    onClose();
  }

  function changeText(next: string) {
    setText(next);
    setConfirm(null);
  }

  return {
    text,
    changeText,
    isBusy,
    /** A failed save first, else a failed look-up. */
    error: error ?? lookup.error,
    confirm,
    setConfirm,
    free,
    freeProblem,
    resolving,
    result,
    toSave,
    tooMany,
    canApply,
    save,
    apply,
    close,
  };
}
