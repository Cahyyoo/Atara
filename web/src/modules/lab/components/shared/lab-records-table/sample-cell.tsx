"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { TableCell } from "@/core/components/ui/table";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { cn } from "@/core/lib/utils";
import { subSamplePath, samplePath } from "@/modules/lab/lib/samples/sample-ident";
import { IoChevronForward, IoTimeOutline } from "react-icons/io5";
import { PIN_TINT } from "@/modules/lab/components/shared/lab-records-table/columns";

/** A small icon beside a row's codes: who changed its results, when, to what. */
function HistoryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <IoTimeOutline aria-hidden className="pointer-events-none size-3.5" />
    </button>
  );
}

/**
 * The row's two other codes, a line each: the Sample ID the lab reads by,
 * then the lab code. Each wraps on its own rather than running into the other.
 */
function Codes({ record }: { record: LabRecordListItemDTO }) {
  const t = useTranslations("database");
  return (
    <>
      {record.sampleIdent ? (
        <span className="block max-w-full font-mono text-xs font-medium text-foreground [overflow-wrap:anywhere]">
          {record.sampleIdent}
        </span>
      ) : (
        <span className="block max-w-full text-xs text-muted-foreground/70 italic">{t("sampleIdMissing")}</span>
      )}
      <span className="block max-w-full font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
        {record.labCode}
      </span>
    </>
  );
}

/**
 * The pinned cell that names the row: a sample's code with its Sample ID and
 * lab code beneath, or a sub-sample tucked under the sample it came from.
 */
export function SampleCell({
  record,
  isAssay,
  open,
  anySubs,
  pinSample,
  onToggleSubs,
  onHistory,
}: {
  record: LabRecordListItemDTO;
  isAssay: boolean;
  /** Whether this sample's sub-samples are unfolded beneath it. */
  open: boolean;
  anySubs: boolean;
  pinSample: string;
  onToggleSubs: (record: LabRecordListItemDTO) => void;
  onHistory: (record: LabRecordListItemDTO) => void;
}) {
  const t = useTranslations("database");
  const isSub = Boolean(record.parentId);

  return (
    // Wraps rather than cutting off when the column is narrowed: the codes
    // have no spaces, so they may break anywhere -- a code on two lines still
    // reads, one ending in "..." does not.
    <TableCell
      className={cn(
        pinSample,
        isAssay && PIN_TINT,
        "whitespace-normal align-top group-hover:bg-muted"
      )}
    >
      {isSub ? (
        // A sub-sample beneath the sample it was taken from:
        // the same container, its own results.
        <div className="flex min-w-0 animate-in flex-col items-start pl-7 duration-150 fade-in-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span aria-hidden className="text-muted-foreground">↳</span>
            {/* Its own page, like a sample's: a link, so the
                row's own click steps aside. */}
            <Link
              href={subSamplePath(record.sample.sampleCode, record.subCode ?? "")}
              className="text-primary hover:underline"
            >
              {t("subs.label", { code: record.subCode ?? "" })}
            </Link>
            <HistoryButton
              label={t("history.rowLabel", { code: record.labCode })}
              onClick={() => onHistory(record)}
            />
          </span>
          <Codes record={record} />
        </div>
      ) : (
      <div className="flex min-w-0 items-start gap-1">
        {/* Its sub-samples fold away behind an arrow: right
            while folded, down while open. A button, so the
            row's own click (tick, or open the record) stays
            out of the way on its own. */}
        {(record.subs?.length ?? 0) > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t("subs.toggle", { count: record.subs!.length })}
            title={t("subs.toggle", { count: record.subs!.length })}
            onClick={() => onToggleSubs(record)}
            className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <IoChevronForward
              aria-hidden
              className={cn(
                "pointer-events-none size-3.5 transition-transform duration-150",
                open && "rotate-90"
              )}
            />
          </button>
        ) : anySubs ? (
          <span aria-hidden className="size-5 shrink-0" />
        ) : null}
      <div className="flex min-w-0 flex-col items-start">
        {/*
          A real link, at last.

          This was a span in the primary colour: it looked
          like a link on both lists and was one on neither.
          Clicking it ticked the row here and opened the
          record panel on the database — never the sample it
          names, which is the one thing its colour promised.

          Nothing else had to change for it. isInteractive
          above already counts an anchor, so the row's own
          click handler steps aside on its own: no
          stopPropagation, and no exception for somebody to
          remember later.
        */}
        <span className="flex flex-wrap items-center gap-x-1.5">
          <Link
            href={samplePath(record.sample.sampleCode)}
            className="font-medium text-primary [overflow-wrap:anywhere] hover:underline"
          >
            {record.sample.sampleCode}
          </Link>
          {(record.subs?.length ?? 0) > 0 ? (
            <span className="rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground">
              {t("subs.count", { count: record.subs!.length })}
            </span>
          ) : null}
          <HistoryButton
            label={t("history.rowLabel", { code: record.sample.sampleCode })}
            onClick={() => onHistory(record)}
          />
        </span>
        <Codes record={record} />
      </div>
      </div>
      )}
    </TableCell>
  );
}
