"use client";

import { useMemo, useState } from "react";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { searchIdentForms } from "@/modules/lab/lib/samples/sample-ident";

/** Which samples show their sub-samples, and the rows that makes. */
export function useSubFolds(records: LabRecordListItemDTO[], search: string) {
  /**
   * Which samples have their sub-samples unfolded beneath them. Folded unless
   * opened with the arrow -- or unless a search matched one of the subs, which
   * would otherwise find the sample without showing why. What was set by hand
   * wins over what the search opened.
   */
  const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const searchOpens = useMemo(() => {
    // The same hands the server matched the Sample ID in, so a search typed
    // with slashes throughout still unfolds the sub that answered it.
    const needles = searchIdentForms(search).map((form) => form.toLowerCase());
    if (needles.length === 0) return new Set<string>();
    return new Set(
      records
        .filter((record) =>
          record.subs?.some((sub) =>
            [sub.labCode, sub.sampleIdent].some((code) => {
              const text = code?.toLowerCase();
              return text !== undefined && needles.some((needle) => text.includes(needle));
            })
          )
        )
        .map((record) => record.id)
    );
  }, [records, search]);
  function isOpen(record: LabRecordListItemDTO): boolean {
    return folds.get(record.id) ?? searchOpens.has(record.id);
  }
  function toggleSubs(record: LabRecordListItemDTO) {
    const open = !isOpen(record);
    setFolds((previous) => new Map(previous).set(record.id, open));
  }

  /** Whether any sample on the page has subs, so the codes keep one indent. */
  const anySubs = records.some((record) => (record.subs?.length ?? 0) > 0);
  /**
   * The rows as drawn: each sample, then its sub-samples beneath it. Ticking,
   * shift-ranges and "select shown" all follow this order.
   */
  const rows = useMemo(
    () =>
      records.flatMap((record) => [
        record,
        ...((folds.get(record.id) ?? searchOpens.has(record.id)) ? (record.subs ?? []) : []),
      ]),
    [records, folds, searchOpens]
  );

  return { setFolds, isOpen, toggleSubs, anySubs, rows };
}
