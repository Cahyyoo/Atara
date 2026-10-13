"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { Button } from "@/core/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/core/components/ui/select";
import { MasterFilter } from "@/modules/lab/components/shared/master-filter";
import { getShiftDate, toShiftDateInputValue } from "@/modules/lab/lib/stages/shift-date";
import { cn } from "@/core/lib/utils";
import { IoCloseCircleOutline, IoSearchOutline } from "react-icons/io5";

export type ResultsFilter = "all" | "missing" | "present";
/** Whether the record has its Sample ID yet: barcodes are made first, identity later. */
export type IdentFilterValue = "all" | "has" | "missing";

export interface LabRecordFilterValues {
  search: string;
  placeId: string;
  from: string;
  to: string;
  results: ResultsFilter;
  ident?: IdentFilterValue;
}

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shift day `daysBack` days before the current one, as YYYY-MM-DD. */
function shiftDay(daysBack: number): string {
  return toShiftDateInputValue(new Date(getShiftDate().getTime() - daysBack * DAY_MS));
}

function presetRange(preset: Exclude<DatePreset, "custom">): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const today = shiftDay(0);
  const back = preset === "today" ? 0 : preset === "7d" ? 6 : 29;
  return { from: shiftDay(back), to: today };
}

/** Which preset the range in the URL is, so the picker names it after a reload. */
function presetOf(from: string, to: string): DatePreset {
  if (!from && !to) return "all";
  const today = shiftDay(0);
  if (to === today) {
    if (from === today) return "today";
    if (from === shiftDay(6)) return "7d";
    if (from === shiftDay(29)) return "30d";
  }
  return "custom";
}

/**
 * The filters both lab-record pages share: code search, place, a range of
 * shift days, and whether a result has been entered.
 *
 * Presentational on purpose. The entry page has to be able to stop a filter
 * change while there are unsaved edits, so the owner applies every change --
 * this only says what was asked for.
 */
export function LabRecordFilters({
  values,
  onChange,
  showResults = false,
  resultsVariant = "segmented",
  resultsDefault = "all",
  counts,
  showIdent = false,
  trailing,
}: {
  values: LabRecordFilterValues;
  /** Keys set to null are removed from the URL. */
  onChange: (updates: Record<string, string | null>) => void;
  showResults?: boolean;
  /**
   * A row of buttons where the choice is the point of the page (entering
   * results), a dropdown in the toolbar where it is one filter among several.
   */
  resultsVariant?: "segmented" | "select";
  /** What the results filter means when the URL says nothing. */
  resultsDefault?: ResultsFilter;
  counts?: { missing: number; present: number } | null;
  /** The Sample ID filter: has one yet, or still to be filled in. */
  showIdent?: boolean;
  /** Buttons that belong on the same row, such as the column picker. */
  trailing?: ReactNode;
}) {
  const t = useTranslations("database.filters");
  const tDatabase = useTranslations("database");
  const [searchInput, setSearchInput] = useState(values.search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Custom" is a choice as much as a state: picking it has to show the date
  // boxes even before either date has been typed.
  const [customChosen, setCustomChosen] = useState(false);

  const preset = customChosen ? "custom" : presetOf(values.from, values.to);

  function changeSearch(next: string) {
    setSearchInput(next);
    // Debounced here rather than in an effect, so typing never re-runs a query
    // per keystroke and a reset can clear the box in the same breath.
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onChange({ search: next.trim() || null }), 300);
  }

  function changePreset(next: DatePreset) {
    if (next === "custom") {
      setCustomChosen(true);
      return;
    }
    setCustomChosen(false);
    const range = presetRange(next);
    onChange({ from: range.from, to: range.to });
  }

  const isFiltered =
    values.search !== "" ||
    values.placeId !== "ALL" ||
    values.from !== "" ||
    values.to !== "" ||
    (showResults && values.results !== resultsDefault) ||
    (showIdent && (values.ident ?? "all") !== "all");

  function reset() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchInput("");
    setCustomChosen(false);
    onChange({ search: null, placeId: null, from: null, to: null, results: null, ident: null });
  }

  const identLabels: Record<IdentFilterValue, string> = {
    all: t("identAll"),
    has: t("identHas"),
    missing: t("identMissing"),
  };

  const presetLabels: Record<DatePreset, string> = {
    all: t("dateAll"),
    today: t("dateToday"),
    "7d": t("date7"),
    "30d": t("date30"),
    custom: t("dateCustom"),
  };

  const resultOptions: { value: ResultsFilter; label: string; count?: number }[] = [
    { value: "missing", label: t("resultsMissing"), count: counts?.missing },
    { value: "present", label: t("resultsPresent"), count: counts?.present },
    { value: "all", label: t("resultsAll"), count: counts ? counts.missing + counts.present : undefined },
  ];

  const resultLabel = (option: (typeof resultOptions)[number]) =>
    option.count === undefined ? option.label : `${option.label} (${option.count})`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        {/* The search takes whatever the other controls leave, so the row
            stays one row on a laptop instead of wrapping its last buttons. */}
        <div className="relative lg:min-w-48 lg:flex-1">
          <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={tDatabase("searchPlaceholder")}
            data-tour="records-search"
            placeholder={tDatabase("searchPlaceholder")}
            value={searchInput}
            onChange={(event) => changeSearch(event.target.value)}
            className="pl-8"
          />
        </div>

        <MasterFilter
          kind="PLACE"
          value={values.placeId}
          onChange={(next) => onChange({ placeId: next })}
          className="w-full lg:w-40"
        />

        <Select
          value={preset}
          items={presetLabels}
          onValueChange={(next) => changePreset((next ?? "all") as DatePreset)}
        >
          <SelectTrigger className="w-full lg:w-44" aria-label={t("dateLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(presetLabels) as DatePreset[]).map((option) => (
              <SelectItem key={option} value={option}>
                {presetLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={t("dateFrom")}
              className="w-full lg:w-40"
              value={values.from}
              max={values.to || undefined}
              onChange={(event) => onChange({ from: event.target.value || null })}
            />
            <span className="text-sm text-muted-foreground">–</span>
            <Input
              type="date"
              aria-label={t("dateTo")}
              className="w-full lg:w-40"
              value={values.to}
              min={values.from || undefined}
              onChange={(event) => onChange({ to: event.target.value || null })}
            />
          </div>
        ) : null}

        {showResults && resultsVariant === "select" ? (
          <Select
            value={values.results}
            items={Object.fromEntries(resultOptions.map((option) => [option.value, resultLabel(option)]))}
            onValueChange={(next) =>
              onChange({ results: (next ?? resultsDefault) === resultsDefault ? null : (next as string) })
            }
          >
            <SelectTrigger data-tour="records-results" className="w-full lg:w-56" aria-label={t("resultsLabel")}>
              {/* Named on the trigger: "All (97)" alone does not say all of what. */}
              <SelectValue>
                {(value) => {
                  const option = resultOptions.find((item) => item.value === value);
                  return option ? `${t("resultsLabel")}: ${resultLabel(option)}` : "";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* "All" first in a dropdown, where it is the resting state. */}
              {[resultOptions[2], resultOptions[0], resultOptions[1]].map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {resultLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {showIdent ? (
          <Select
            value={values.ident ?? "all"}
            items={identLabels}
            onValueChange={(next) => onChange({ ident: !next || next === "all" ? null : (next as string) })}
          >
            <SelectTrigger data-tour="records-ident" className="w-full lg:w-52" aria-label={t("identLabel")}>
              <SelectValue>
                {(value) => `${t("identLabel")}: ${identLabels[(value as IdentFilterValue) ?? "all"]}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(identLabels) as IdentFilterValue[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {identLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {isFiltered ? (
          <Button variant="ghost" size="sm" className="gap-1.5 self-start lg:self-auto" onClick={reset}>
            <IoCloseCircleOutline className="size-4" />
            {t("reset")}
          </Button>
        ) : null}

        {trailing ? <div className="flex flex-wrap gap-2 lg:ml-auto">{trailing}</div> : null}
      </div>

      {showResults && resultsVariant === "segmented" ? (
        // A segmented control rather than a dropdown: there are three states,
        // and the one that matters -- what still needs a result -- should be
        // readable at a glance, with its count, not behind a click.
        <div data-tour="assay-results" role="group" aria-label={t("resultsLabel")} className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1">
          {resultOptions.map((option) => {
            const active = values.results === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({ results: option.value === resultsDefault ? null : option.value })
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
                {option.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      active ? "bg-primary/10 text-primary" : "bg-background/60"
                    )}
                  >
                    {option.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
