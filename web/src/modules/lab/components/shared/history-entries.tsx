"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ASSAY_FIELDS, formatAssayValue } from "@/modules/lab/lib/records/assay";
import { RESULT_KEYS } from "@/modules/lab/lib/records/overwrite";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { subSamplePath, samplePath } from "@/modules/lab/lib/samples/sample-ident";
import { cn } from "@/core/lib/utils";
import type { RecordHistoryEntry } from "@/modules/lab/types";

const OPTION_KINDS: Record<string, string> = {
  placeId: "PLACE",
  rockTypeId: "ROCK_TYPE",
  nonProdId: "NON_PROD",
  pitId: "PIT",
  sirId: "SIR",
};
const IDENTITY_TEXT = new Set(["bargingNo", "sequenceNo", "sampleNo", "sackCount"]);
const INSTRUMENT = new Set([
  "measurementMethod",
  "solutionId",
  "measurementFinished",
  "xrayInstrument",
  "wp",
  "w0",
  "wd",
]);

function isAssay(key: string): boolean {
  return ASSAY_FIELDS.some((field) => field.key === key);
}

/** Assays to three places or more, as stored; counts as whole numbers; times on the lab's clock. */
function formatValue(key: string, value: number | string | null): string {
  if (value === null || value === "") return "—";
  if (key === "measurementFinished") return formatWitaDateTime(String(value)) ?? String(value);
  if (typeof value === "number" && isAssay(key)) return formatAssayValue(value, 3);
  return String(value);
}

/**
 * Changes as a list of "who, when, which record, what from what to what, and
 * why", newest first. A result that replaced an earlier value -- rather than
 * filling an empty one -- is marked, since that is the change worth a second
 * look.
 */
export function HistoryEntries({
  entries,
  showSample = false,
}: {
  entries: RecordHistoryEntry[];
  /** On the page listing every record: say which sample each change was to. */
  showSample?: boolean;
}) {
  const t = useTranslations("history");
  const tDatabase = useTranslations("database");
  const tIdentity = useTranslations("database.identity");
  const tMaster = useTranslations("masterData");
  const format = useFormatter();

  function labelFor(key: string): string {
    const assay = ASSAY_FIELDS.find((field) => field.key === key);
    if (assay) return assay.shortLabel;
    if (OPTION_KINDS[key]) return tMaster(`kind.${OPTION_KINDS[key]}`);
    if (IDENTITY_TEXT.has(key)) return tIdentity(key);
    if (INSTRUMENT.has(key)) return tDatabase(key);
    if (key === "sampleIdent") return tDatabase("sampleIdent");
    if (key === "remarks") return tDatabase("dialog.remarks");
    if (key === "subCode") return t("subCreated");
    if (key === "sub") return t("subRemoved");
    return key;
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-xl border bg-background px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{entry.changedBy}</span>
              {showSample && entry.record.sampleCode ? (
                <Link
                  href={samplePath(entry.record.sampleCode)}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {entry.record.sampleCode}
                </Link>
              ) : null}
              {entry.record.subCode ? (
                entry.record.sampleCode ? (
                  <Link
                    href={subSamplePath(entry.record.sampleCode, entry.record.subCode)}
                    className="rounded-full bg-muted px-1.5 text-[11px] text-primary hover:underline"
                  >
                    ↳ {tDatabase("subs.label", { code: entry.record.subCode })}
                  </Link>
                ) : (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                    ↳ {tDatabase("subs.label", { code: entry.record.subCode })}
                  </span>
                )
              ) : null}
            </p>
            <time dateTime={entry.changedAt} className="text-xs text-muted-foreground tabular-nums">
              {format.dateTime(new Date(entry.changedAt), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Makassar",
              })}
            </time>
          </div>
          {showSample ? (
            <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {entry.record.sampleIdent ?? entry.record.labCode}
            </p>
          ) : null}
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            {Object.entries(entry.changes).map(([key, change]) => {
              const replaced = RESULT_KEYS.includes(key) && change.from !== null && change.from !== "";
              return (
                <li
                  key={key}
                  className={cn(
                    "text-sm whitespace-nowrap text-muted-foreground",
                    replaced && "text-amber-700 dark:text-amber-400"
                  )}
                >
                  <span className={replaced ? undefined : "text-foreground"}>{labelFor(key)}</span>{" "}
                  <span className="tabular-nums line-through">{formatValue(key, change.from)}</span> →{" "}
                  <span className="font-medium tabular-nums">{formatValue(key, change.to)}</span>
                </li>
              );
            })}
          </ul>
          {entry.reason ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("reason")} {entry.reason}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
