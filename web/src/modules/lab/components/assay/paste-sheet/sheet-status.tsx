"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import type { ImportPreviewDTO } from "@/modules/lab/types";
import type { Verdict } from "@/modules/lab/components/assay/paste-sheet/sheet-check";
import {
  IoAddCircle,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoHelpCircle,
  IoRemoveCircleOutline,
  IoWarning,
} from "react-icons/io5";

const MARKS = {
  update: { icon: IoCheckmarkCircle, className: "text-emerald-600 dark:text-emerald-400" },
  create: { icon: IoAddCircle, className: "text-primary" },
  unchanged: { icon: IoRemoveCircleOutline, className: "text-muted-foreground" },
  unknown: { icon: IoHelpCircle, className: "text-amber-600 dark:text-amber-400" },
  invalid: { icon: IoCloseCircle, className: "text-destructive" },
} as const;

/**
 * A row's verdict beside its number: saved as an update, a new sub-sample,
 * nothing to change, no such sample (left out), or something to fix. The words
 * are the tooltip and the accessible name, so the column stays narrow.
 */
export function StatusMark({
  verdict,
  filled,
  pending,
}: {
  verdict: Verdict | undefined;
  filled: boolean;
  pending: boolean;
}) {
  const t = useTranslations("assay.paste.status");
  if (!filled) return null;
  if (!verdict) {
    // Not checked yet: a soft shimmer where the mark will be, rather than nothing.
    return pending ? <span aria-hidden className="skeleton-sheen inline-block size-3.5 rounded-full bg-muted" /> : null;
  }
  const { icon: Icon, className } = MARKS[verdict.status];
  const label = verdict.message ? `${t(verdict.status)}: ${verdict.message}` : t(verdict.status);
  return <Icon role="img" aria-label={label} title={label} className={cn("size-4 shrink-0", className)} />;
}

/**
 * Beside the verdict: results that read exactly like another row's on the
 * sheet, or another sample's already stored. A warning; saving asks first.
 */
export function DuplicateMark({ lines, samples }: { lines?: number[]; samples?: string[] }) {
  const t = useTranslations("assay.paste");
  if (!lines?.length && !samples?.length) return null;
  const label = [
    lines?.length ? t("duplicateLines", { lines: lines.join(", ") }) : null,
    samples?.length ? t("duplicateOf", { samples: samples.join(", ") }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <IoWarning role="img" aria-label={label} title={label} className="size-4 shrink-0 text-amber-500 dark:text-amber-400" />
  );
}

/** What the sheet would do, counted, above it. */
export function SheetSummary({ summary }: { summary: ImportPreviewDTO["summary"] }) {
  const t = useTranslations("assay.paste");
  const chips: { key: string; text: string; tone: string }[] = [
    { key: "update", text: t("toUpdate", { count: summary.update }), tone: "text-emerald-700 dark:text-emerald-300" },
    { key: "create", text: t("toCreate", { count: summary.create }), tone: "text-primary" },
    { key: "overwrite", text: t("toOverwrite", { count: summary.overwrite }), tone: "text-amber-700 dark:text-amber-300" },
    { key: "duplicate", text: t("toDuplicate", { count: summary.duplicate }), tone: "text-amber-700 dark:text-amber-300" },
    { key: "unchanged", text: t("unchanged", { count: summary.unchanged }), tone: "text-muted-foreground" },
    { key: "unknown", text: t("unknown", { count: summary.unknown }), tone: "text-amber-700 dark:text-amber-300" },
    { key: "invalid", text: t("invalid", { count: summary.invalid }), tone: "text-destructive" },
  ];
  const counts: Record<string, number> = { ...summary };
  return (
    <ul className="flex flex-wrap gap-1.5" aria-live="polite">
      <li className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t("rowsRead", { count: summary.total })}</li>
      {chips
        .filter((chip) => (counts[chip.key] ?? 0) > 0)
        .map((chip) => (
          <li key={chip.key} className={cn("rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium", chip.tone)}>
            {chip.text}
          </li>
        ))}
    </ul>
  );
}
