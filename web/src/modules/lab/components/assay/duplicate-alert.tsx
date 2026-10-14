"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import type { DuplicateGroup } from "@/modules/lab/lib/records/assay-duplicates";
import { IoReloadOutline, IoWarning } from "react-icons/io5";

/** Groups listed in the banner before "and N more". */
const BANNER_GROUPS = 8;

/** How many rows the groups name, each once. */
export function duplicateRowCount(groups: readonly DuplicateGroup[]): number {
  return new Set(groups.flatMap((group) => (group.kind === "rows" ? group.rows.map((entry) => entry.row) : [group.row]))).size;
}

/** A row named in a warning: its number, then its Sample ID; a button where the screen can go there. */
function RowName({ row, label, onGoToRow }: { row: number; label: string; onGoToRow?: (row: number) => void }) {
  const t = useTranslations("assay.paste");
  const text = (
    <>
      <span className="font-semibold">{t("duplicateRow", { row })}</span>
      {label ? <span className="font-mono text-xs"> · {label}</span> : null}
    </>
  );
  if (!onGoToRow) return <span className="whitespace-nowrap">{text}</span>;
  return (
    <button
      type="button"
      onClick={() => onGoToRow(row)}
      title={t("goToRow", { row })}
      className="whitespace-nowrap rounded-md underline decoration-amber-500/60 underline-offset-2 hover:bg-amber-200/60 dark:hover:bg-amber-500/20"
    >
      {text}
    </button>
  );
}

/** One group as one line: the rows alike among themselves, or a row like a stored sample. */
function GroupLine({ group, onGoToRow }: { group: DuplicateGroup; onGoToRow?: (row: number) => void }) {
  const t = useTranslations("assay.paste");
  if (group.kind === "rows") {
    return (
      <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {group.rows.map((entry, index) => (
          <span key={entry.row} className="inline-flex items-baseline gap-2">
            {index > 0 ? <span aria-hidden>=</span> : null}
            <RowName row={entry.row} label={entry.label} onGoToRow={onGoToRow} />
          </span>
        ))}
        <span className="text-amber-800/80 dark:text-amber-300/80">— {t("duplicateRows")}</span>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <RowName row={group.row} label={group.label} onGoToRow={onGoToRow} />
      <span className="text-amber-800/80 dark:text-amber-300/80">
        — {t("duplicateStored", { samples: group.samples.join(", ") })}
      </span>
    </li>
  );
}

/**
 * Hard to miss: rows whose results read exactly like another row's or another
 * stored sample's, listed by group, above what is about to be saved. Each row
 * number goes to its row, where the screen can.
 */
export function DuplicateBanner({
  groups,
  onGoToRow,
}: {
  groups: readonly DuplicateGroup[];
  onGoToRow?: (row: number) => void;
}) {
  const t = useTranslations("assay.paste");
  if (groups.length === 0) return null;
  const shown = groups.slice(0, BANNER_GROUPS);
  return (
    <div
      role="alert"
      className="flex shrink-0 gap-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <IoWarning aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-500" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-semibold">{t("duplicateTitle", { count: duplicateRowCount(groups) })}</p>
        <p className="text-amber-800/90 dark:text-amber-300/90">{t("duplicateBody")}</p>
        <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
          {shown.map((group, index) => (
            <GroupLine key={index} group={group} onGoToRow={onGoToRow} />
          ))}
        </ul>
        {groups.length > shown.length ? (
          <p className="text-xs">{t("duplicateMore", { count: groups.length - shown.length })}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Asked before rows with identical results are saved: the full list, and the
 * replacements too when the same save would replace earlier results.
 */
export function DuplicateConfirmDialog({
  open,
  groups,
  overwriteCount,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  groups: readonly DuplicateGroup[];
  overwriteCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("assay.paste");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IoWarning aria-hidden className="size-5 text-amber-500" />
            {t("duplicateDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("duplicateTitle", { count: duplicateRowCount(groups) })} {t("duplicateBody")}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {groups.map((group, index) => (
            <GroupLine key={index} group={group} />
          ))}
        </ul>
        {overwriteCount > 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">{t("overwriteConfirm", { count: overwriteCount })}</p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {tCommon("cancel")}
          </Button>
          <Button className="gap-2" disabled={busy} onClick={onConfirm}>
            {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {t("saveAnyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
