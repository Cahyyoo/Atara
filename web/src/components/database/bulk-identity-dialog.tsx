"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useMasterOptions } from "@/hooks/use-master-options";
import { cn } from "@/lib/utils";
import type { ApiResult, LabRecordListItemDTO, MasterKind, MasterOptionDTO } from "@/types";
import {
  IoArrowUndoOutline,
  IoChevronBack,
  IoChevronDown,
  IoChevronForward,
  IoClose,
  IoExpandOutline,
  IoReloadOutline,
  IoRemoveOutline,
} from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

/** A pause in typing long enough to ask what the Sample IDs would become. */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * From this many Sample IDs on, the dialog starts on one form for all of
 * them -- changing a pit in forty forms is not what anyone wants -- and the
 * list of Sample IDs gets a search and an "only changed" filter.
 */
const COMPACT_FROM = 6;

type PickerKey = "placeId" | "rockTypeId" | "nonProdId" | "sirId" | "pitId";
type TextKey = "bargingNo" | "sequenceNo" | "sampleNo" | "sackCount";
type FieldKey = PickerKey | TextKey;

/** The identity columns, in the order the Sample ID reads them. */
const PICKERS: { key: PickerKey; kind: MasterKind }[] = [
  { key: "placeId", kind: "PLACE" },
  { key: "rockTypeId", kind: "ROCK_TYPE" },
  { key: "nonProdId", kind: "NON_PROD" },
  { key: "sirId", kind: "SIR" },
  { key: "pitId", kind: "PIT" },
];
const TEXTS: { key: TextKey; numeric: boolean }[] = [
  { key: "bargingNo", numeric: false },
  { key: "sequenceNo", numeric: true },
  { key: "sampleNo", numeric: true },
  { key: "sackCount", numeric: true },
];
const FIELD_KEYS: FieldKey[] = [...PICKERS.map((field) => field.key), ...TEXTS.map((field) => field.key)];

/** A picker set to nothing, and a picker left on "these differ". */
const NONE = "__none__";
const MIXED = "__mixed__";

const isPicker = (key: FieldKey) => PICKERS.some((field) => field.key === key);
const isNumeric = (key: FieldKey) => TEXTS.some((field) => field.key === key && field.numeric);

interface Preview {
  preview: { sampleCode: string; labCode: string; from: string | null; to: string | null }[];
  more: number;
  clashes: string[];
  changed: number;
}

/** What the chosen records hold in one column now: one value, none, or several. */
export function summarizeCurrent(
  values: (string | number | null)[],
  label: (value: string | number) => string
): { kind: "empty" } | { kind: "one"; value: string } | { kind: "mixed"; values: string[]; hasEmpty: boolean } {
  const present = [...new Set(values.filter((value): value is string | number => value !== null && value !== ""))];
  const hasEmpty = values.some((value) => value === null || value === "");
  if (present.length === 0) return { kind: "empty" };
  if (present.length === 1 && !hasEmpty) return { kind: "one", value: label(present[0]) };
  return { kind: "mixed", values: present.map(label), hasEmpty };
}

interface Group {
  ident: string | null;
  records: LabRecordListItemDTO[];
}

/**
 * One form per Sample ID: each record that has one is edited on its own,
 * and the records without one -- a batch of fresh barcodes -- together. In
 * table order, by where each group's first record sits.
 */
export function groupBySampleIdent(records: LabRecordListItemDTO[]): Group[] {
  const groups: Group[] = [];
  const byIdent = new Map<string | null, Group>();
  for (const record of records) {
    const ident = record.sampleIdent || null;
    const group = byIdent.get(ident);
    if (group) group.records.push(record);
    else {
      const created = { ident, records: [record] };
      byIdent.set(ident, created);
      groups.push(created);
    }
  }
  return groups;
}

function isWholeNumber(value: string) {
  return /^\d+$/.test(value.trim());
}

/** What one field asks for, judged against where it started. */
type Status = "keep" | "set" | "clear" | "invalid";
type Initial = Record<FieldKey, { start: string; mixed: boolean }>;
interface GroupState {
  values: Record<FieldKey, string>;
  /** Several records: number them in table order from the sample number typed. */
  sequential: boolean;
}
type GroupUpdate = (index: number, update: (state: GroupState) => GroupState) => void;

/** Where each field starts: the value the records share, empty, or "mixed". */
function initialOf(records: LabRecordListItemDTO[]): Initial {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => {
      const summary = summarizeCurrent(
        records.map((record) => record[key] ?? null),
        (value) => String(value)
      );
      const mixed = summary.kind === "mixed";
      const start = summary.kind === "one" ? summary.value : isPicker(key) ? (mixed ? MIXED : NONE) : "";
      return [key, { start, mixed }];
    })
  ) as Initial;
}

function freshState(initial: Initial): GroupState {
  return {
    values: Object.fromEntries(FIELD_KEYS.map((key) => [key, initial[key].start])) as Record<FieldKey, string>,
    sequential: true,
  };
}

function fieldStatus(key: FieldKey, raw: string, start: string, mixed: boolean): Status {
  const value = raw.trim();
  if (value === start) return "keep";
  if (isPicker(key)) return value === NONE ? "clear" : value === MIXED ? "keep" : "set";
  // An empty box over records that differ means "leave them be"; over
  // records that agree, it means "empty it".
  if (value === "") return mixed ? "keep" : "clear";
  return isNumeric(key) && !isWholeNumber(value) ? "invalid" : "set";
}

/** What one form asks of its records: only the fields that differ from where they started. */
function groupRequest(records: LabRecordListItemDTO[], initial: Initial, state: GroupState) {
  const statuses = Object.fromEntries(
    FIELD_KEYS.map((key) => [key, fieldStatus(key, state.values[key], initial[key].start, initial[key].mixed)])
  ) as Record<FieldKey, Status>;
  const touched = FIELD_KEYS.filter((key) => statuses[key] !== "keep").length;
  const invalid = FIELD_KEYS.some((key) => statuses[key] === "invalid");
  const numberInOrder = records.length > 1 && state.sequential && statuses.sampleNo === "set";
  const set = Object.fromEntries(
    FIELD_KEYS.filter((key) => statuses[key] === "set" && !(key === "sampleNo" && numberInOrder)).map((key) => {
      const value = state.values[key].trim();
      return [key, isNumeric(key) ? Number(value) : value];
    })
  );
  const clear = FIELD_KEYS.filter((key) => statuses[key] === "clear");
  const sampleNoStart = numberInOrder ? Number(state.values.sampleNo) : null;
  const changes = Object.keys(set).length > 0 || clear.length > 0 || sampleNoStart !== null;
  return {
    touched,
    invalid,
    request: changes ? { ids: records.map((record) => record.id), set, clear, sampleNoStart } : null,
  };
}

/**
 * Filling in, or changing, the identity of several records at once: a batch
 * of new barcodes from the same place and pit, or twenty samples entered
 * under the wrong pit.
 *
 * Ordinary forms: one for all the records, or one per Sample ID (the records
 * without one share a form) -- a list of them on the left, the chosen one's
 * fields on the right. Each field starts on what its records hold now -- the
 * value itself when they agree, empty when none has one, "mixed" when they
 * differ -- so a field left alone changes nothing, a new value is set on its
 * records, and emptying a field clears it. Each changed field says so and can
 * be put back. Everything is saved together; the footer says what a save
 * would do, the Sample IDs it produces are a click away, and a clash --
 * between forms too -- blocks the save and shows itself.
 *
 * Kept light on purpose: no backdrop blur behind it, one form drawn at a
 * time, the pickers do not lock the page, and typing redraws one field.
 *
 * It can be minimized to a small bar, to look at the table behind it: the
 * dialog is hidden, not closed, so everything typed is still there when it
 * is opened again.
 */
export function BulkIdentityDialog({
  records,
  open,
  minimized = false,
  onMinimizedChange,
  onClose,
  onSaved,
}: {
  /** In table order: the order sample numbers are given in. */
  records: LabRecordListItemDTO[];
  open: boolean;
  /** Hidden behind a small bar, with everything typed kept. */
  minimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open && !minimized}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent
        keepMounted
        className={cn(
          "max-h-[90vh] gap-3 overflow-hidden duration-200 ease-out sm:max-w-4xl",
          // Minimizing, it shrinks toward the bar that takes its place.
          minimized && "data-closed:origin-bottom-right data-closed:slide-out-to-right-8 data-closed:slide-out-to-bottom-8"
        )}
        overlayClassName="bg-black/30 supports-backdrop-filter:backdrop-blur-none"
      >
        <DialogHeader className="gap-1 pr-16">
          <DialogTitle>{t("title", { count: records.length })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {onMinimizedChange ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-10"
            aria-label={t("minimize")}
            title={t("minimize")}
            disabled={busy}
            onClick={() => onMinimizedChange(true)}
          >
            <IoRemoveOutline />
          </Button>
        ) : null}
        {/* A fresh form for every opening and every selection, starting from
            what these records hold now -- and kept while minimized. */}
        {open ? (
          <BulkIdentityForm
            key={records.map((record) => record.id).join(",")}
            records={records}
            busy={busy}
            minimized={minimized}
            onRestore={() => onMinimizedChange?.(false)}
            onBusy={setBusy}
            onCancel={onClose}
            onSaved={() => {
              onSaved();
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** How the list on the left marks a form: how many fields changed, and whether one is wrong. */
interface Mark {
  touched: number;
  invalid: boolean;
}

function BulkIdentityForm({
  records,
  busy,
  minimized,
  onRestore,
  onBusy,
  onCancel,
  onSaved,
}: {
  records: LabRecordListItemDTO[];
  busy: boolean;
  minimized: boolean;
  onRestore: () => void;
  onBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const tCommon = useTranslations("common");
  const options = useMasterOptions();

  const groups = useMemo(() => groupBySampleIdent(records), [records]);
  const initials = useMemo(() => groups.map((group) => initialOf(group.records)), [groups]);
  const togetherInitial = useMemo(() => initialOf(records), [records]);
  const several = groups.length > 1;

  // Both ways of editing keep their own fields, so switching loses nothing;
  // only the one showing is saved.
  const [mode, setMode] = useState<"together" | "each">(groups.length >= COMPACT_FROM ? "together" : "each");
  const together = several && mode === "together";
  const [eachStates, setEachStates] = useState<GroupState[]>(() => initials.map(freshState));
  const [togetherState, setTogetherState] = useState<GroupState>(() => freshState(togetherInitial));
  const changeEach = useCallback<GroupUpdate>(
    (index, update) => setEachStates((previous) => previous.map((state, at) => (at === index ? update(state) : state))),
    []
  );
  const changeTogether = useCallback<GroupUpdate>((_index, update) => setTogetherState(update), []);

  // The list of Sample IDs: which one is open, and which are listed at all.
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const eachAsked = useMemo(
    () => groups.map((group, index) => groupRequest(group.records, initials[index], eachStates[index])),
    [groups, initials, eachStates]
  );
  const togetherAsked = useMemo(
    () => groupRequest(records, togetherInitial, togetherState),
    [records, togetherInitial, togetherState]
  );
  const asked = together ? [togetherAsked] : eachAsked;

  // The list redraws only when a form's mark changes, not on every keystroke.
  const markKey = eachAsked.map((group) => `${group.touched}${group.invalid ? "!" : ""}`).join(",");
  const marks = useMemo<Mark[]>(
    () =>
      markKey.split(",").map((mark) => ({ touched: Number.parseInt(mark, 10) || 0, invalid: mark.endsWith("!") })),
    [markKey]
  );
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      groups.flatMap((group, index) => {
        if (onlyChanged && marks[index].touched === 0) return [];
        if (
          needle &&
          !(group.ident ?? "").toLowerCase().includes(needle) &&
          !group.records.some((record) => record.sample.sampleCode.toLowerCase().includes(needle))
        ) {
          return [];
        }
        return [index];
      }),
    [groups, marks, needle, onlyChanged]
  );
  // Filtered out of the list, the open form gives way to the first one listed.
  const shownActive = visible.includes(active) ? active : (visible[0] ?? null);
  const position = shownActive === null ? -1 : visible.indexOf(shownActive);

  const [preview, setPreview] = useState<{ key: string; data: Preview | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  const [error, setError] = useState<string | null>(null);

  const invalid = asked.some((group) => group.invalid);
  const requests = asked.flatMap((group) => (group.request ? [group.request] : []));
  const key = JSON.stringify({ groups: requests });
  const chosen = requests.length > 0;

  useEffect(() => {
    if (!chosen || invalid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(withBasePath("/api/lab-records/identity"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...JSON.parse(key), dryRun: true }),
          signal: controller.signal,
        });
        const result: ApiResult<Preview> = await response.json();
        setPreview(
          result.success ? { key, data: result.data, error: null } : { key, data: null, error: result.error }
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setPreview({ key, data: null, error: tCommon("networkError") });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [chosen, invalid, key, tCommon]);

  const current = chosen && !invalid && preview.key === key ? preview : null;
  const data = current?.data ?? null;
  // While the next answer is on its way, the last one stays on screen,
  // dimmed, rather than the footer flickering to "checking" on every key.
  const checking = chosen && !invalid && current === null;
  const shown = data ?? (checking ? preview.data : null);
  const clashes = shown?.clashes ?? [];
  const ready = data !== null && data.clashes.length === 0 && data.changed > 0;
  // A clash is shown, not left behind a button.
  const showPreview = shown !== null && (previewOpen || clashes.length > 0);
  const changedFields = asked.reduce((total, group) => total + group.touched, 0);
  const otherModeChanged =
    several && (together ? eachAsked.some((group) => group.touched > 0) : togetherAsked.touched > 0);

  async function save() {
    onBusy(true);
    setError(null);
    try {
      const response = await fetch(withBasePath("/api/lab-records/identity"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: key,
      });
      const result: ApiResult<{ updated: number }> = await response.json();
      if (!result.success) {
        setError(result.error || tCommon("networkError"));
        return;
      }
      toast(t("done", { count: result.data.updated }));
      onBusy(false);
      onSaved();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      onBusy(false);
    }
  }

  const titleOf = (group: Group) => group.ident ?? t("groupNoIdent");
  const subtitleOf = (group: Group) =>
    group.records.length === 1 ? group.records[0].sample.sampleCode : t("groupCount", { count: group.records.length });

  /** What a save would do now, in one line. */
  const status: { text: ReactNode; tone: "muted" | "error" | "ok" } = error
    ? { text: error, tone: "error" }
    : invalid
      ? { text: t("incomplete"), tone: "error" }
      : !chosen
        ? { text: t("statusNone"), tone: "muted" }
        : current?.error
          ? { text: current.error, tone: "error" }
          : shown === null
            ? { text: t("statusChecking"), tone: "muted" }
            : clashes.length > 0
              ? { text: t("statusClash", { count: clashes.length }), tone: "error" }
              : { text: t("statusChanged", { count: shown.changed }), tone: "ok" };

  return (
    <>
      {/* Minimized, the dialog is hidden; this bar stands in for it, outside
          the hidden popup. */}
      {minimized
        ? createPortal(
            <div
              role="region"
              aria-label={t("minimizedTitle")}
              className="fixed right-4 bottom-20 z-40 flex max-w-[calc(100%-2rem)] animate-in items-center gap-3 rounded-2xl border bg-popover py-2 pr-2 pl-4 text-sm text-popover-foreground shadow-raised duration-200 ease-out fade-in-0 slide-in-from-bottom-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{t("minimizedTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("minimizedSummary", { count: records.length, changed: changedFields })}
                </p>
              </div>
              <Button type="button" size="sm" className="gap-1.5" onClick={onRestore}>
                <IoExpandOutline aria-hidden className="size-4" />
                {t("restore")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("discard")}
                title={t("discard")}
                disabled={busy}
                onClick={onCancel}
              >
                <IoClose />
              </Button>
            </div>,
            document.body
          )
        : null}

      {several ? (
        <div className="flex w-fit flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
          {(["together", "each"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={mode === choice}
              onClick={() => setMode(choice)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                mode === choice
                  ? "bg-background font-medium text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {choice === "together"
                ? t("modeTogether", { count: records.length })
                : t("modeEach", { count: groups.length })}
            </button>
          ))}
        </div>
      ) : null}

      {several && !together ? (
        // Master and detail: the list on the left, one form on the right --
        // one form drawn, however many Sample IDs there are. Each side scrolls
        // on its own; on a phone they stack and scroll together.
        <div
          data-slot="bulk-identity-body"
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-1 py-1 sm:flex-row sm:overflow-hidden"
        >
          <GroupList
            groups={groups}
            marks={marks}
            visible={visible}
            active={shownActive}
            tools={groups.length >= COMPACT_FROM}
            query={query}
            onlyChanged={onlyChanged}
            onQuery={setQuery}
            onOnlyChanged={setOnlyChanged}
            onPick={setActive}
          />
          {shownActive === null ? (
            <p className="flex-1 rounded-xl border px-3 py-6 text-center text-sm text-muted-foreground">
              {t("noMatch")}
            </p>
          ) : (
            <section
              aria-label={titleOf(groups[shownActive])}
              className="flex min-h-0 flex-1 flex-col gap-3 overscroll-contain sm:overflow-y-auto sm:pr-1 [contain:content]"
            >
              <header className="flex items-start gap-2">
                <div
                  key={shownActive}
                  className="min-w-0 flex-1 animate-in duration-150 fade-in-0 slide-in-from-right-1"
                >
                  <h3
                    className={cn(
                      "text-sm font-semibold break-all",
                      groups[shownActive].ident ? "font-mono" : undefined
                    )}
                  >
                    {titleOf(groups[shownActive])}
                  </h3>
                  <p className="text-xs text-muted-foreground">{subtitleOf(groups[shownActive])}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("previous")}
                    title={t("previous")}
                    disabled={position <= 0}
                    onClick={() => setActive(visible[position - 1])}
                  >
                    <IoChevronBack />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("position", { at: position + 1, count: visible.length })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("next")}
                    title={t("next")}
                    disabled={position >= visible.length - 1}
                    onClick={() => setActive(visible[position + 1])}
                  >
                    <IoChevronForward />
                  </Button>
                </div>
              </header>
              <GroupFields
                index={shownActive}
                several={groups[shownActive].records.length > 1}
                initial={initials[shownActive]}
                state={eachStates[shownActive]}
                options={options}
                onChange={changeEach}
              />
            </section>
          )}
        </div>
      ) : (
        // One form: the only part that scrolls, its repaints kept inside it.
        <div
          data-slot="bulk-identity-body"
          className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1 [contain:content]"
        >
          {together ? (
            <GroupFields
              index={0}
              several
              initial={togetherInitial}
              state={togetherState}
              options={options}
              onChange={changeTogether}
            />
          ) : (
            <GroupFields
              index={0}
              several={groups[0].records.length > 1}
              initial={initials[0]}
              state={eachStates[0]}
              options={options}
              onChange={changeEach}
            />
          )}
        </div>
      )}

      {shown ? (
        <div
          inert={!showPreview}
          className={cn(
            "grid shrink-0 transition-[grid-template-rows,opacity,margin] duration-200 ease-out",
            showPreview ? "grid-rows-[1fr] opacity-100" : "-mt-3 grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              data-slot="bulk-identity-preview"
              className={cn(
                "flex max-h-48 flex-col gap-2 overflow-y-auto rounded-xl bg-muted/50 p-3 transition-opacity",
                checking && "opacity-60"
              )}
            >
              <p className="text-xs text-muted-foreground">
                {t("changedSummary", { changed: shown.changed, unchanged: records.length - shown.changed })}
              </p>
              <ol className="flex flex-col gap-0.5 font-mono text-xs">
                {shown.preview.map((row) => (
              <li key={row.labCode} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{row.sampleCode}</span>
                <span className="text-muted-foreground line-through">{row.from ?? t("noIdent")}</span>
                <span aria-hidden>→</span>
                <span
                  className={row.to && clashes.includes(row.to) ? "font-semibold text-destructive" : "font-semibold"}
                >
                  {row.to ?? t("noIdent")}
                </span>
              </li>
            ))}
          </ol>
              {shown.more > 0 ? (
                <p className="text-xs text-muted-foreground">{t("more", { count: shown.more })}</p>
              ) : null}
              {clashes.length > 0 ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {t("clash", { ids: clashes.join(", ") })}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <DialogFooter className="gap-2 sm:items-center">
        <div className="flex min-w-0 flex-col gap-0.5 sm:mr-auto">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              role="status"
              aria-busy={checking}
              className={cn(
                "flex items-center gap-1.5 text-sm transition-opacity duration-150",
                status.tone === "error"
                  ? "text-destructive"
                  : status.tone === "ok"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                checking && shown !== null && "opacity-60"
              )}
            >
              {checking ? <IoReloadOutline aria-hidden className="size-3.5 shrink-0 animate-spin" /> : null}
              {status.text}
            </p>
            {shown ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                aria-expanded={showPreview}
                disabled={clashes.length > 0}
                onClick={() => setPreviewOpen(!previewOpen)}
              >
                {t("showPreview")}
                <IoChevronDown aria-hidden className={cn("size-3.5 transition-transform", showPreview && "rotate-180")} />
              </Button>
            ) : null}
          </div>
          {otherModeChanged ? <p className="text-xs text-muted-foreground">{t("otherModeChanges")}</p> : null}
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="button" className="gap-2" disabled={!ready || busy} onClick={() => void save()}>
          {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
          {t("save", { count: shown?.changed ?? records.length })}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * The Sample IDs, one button each, marked once their form changes. Its own
 * memoised component: typing redraws it only when a mark changes.
 */
const GroupList = memo(function GroupList({
  groups,
  marks,
  visible,
  active,
  tools,
  query,
  onlyChanged,
  onQuery,
  onOnlyChanged,
  onPick,
}: {
  groups: Group[];
  marks: Mark[];
  visible: number[];
  active: number | null;
  /** Search and "only changed", for a list long enough to need them. */
  tools: boolean;
  query: string;
  onlyChanged: boolean;
  onQuery: (query: string) => void;
  onOnlyChanged: (onlyChanged: boolean) => void;
  onPick: (index: number) => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const listRef = useRef<HTMLUListElement>(null);
  // Moved with Previous / Next, the list keeps the open Sample ID in view.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:min-h-0 sm:w-64">
      {tools ? (
        <div className="flex flex-col gap-1.5">
          <Input
            aria-label={t("search")}
            placeholder={t("search")}
            className="h-8"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={onlyChanged}
              onChange={(event) => onOnlyChanged(event.target.checked)}
            />
            {t("onlyChanged")}
          </label>
        </div>
      ) : null}
      <ul
        ref={listRef}
        aria-label={t("listLabel")}
        className="flex max-h-40 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border p-1 sm:max-h-none sm:min-h-0 sm:flex-1"
      >
        {visible.map((index) => {
          const group = groups[index];
          const title = group.ident ?? t("groupNoIdent");
          const mark = marks[index];
          const current = index === active;
          return (
            <li key={group.ident ?? "none"}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                onClick={() => onPick(index)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  current ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span
                    title={title}
                    className={cn("min-w-0 flex-1 truncate text-xs font-medium", group.ident ? "font-mono" : undefined)}
                  >
                    {title}
                  </span>
                  {mark.touched > 0 ? (
                    <Badge variant={mark.invalid ? "destructive" : "secondary"} className="h-4 px-1.5 text-[10px]">
                      {t("changedCount", { count: mark.touched })}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {group.records.length === 1
                    ? group.records[0].sample.sampleCode
                    : t("groupCount", { count: group.records.length })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

/**
 * The identity fields of one form. Memoised with stable props from the
 * parent, and each field memoised again, so typing one letter redraws one
 * field -- not the form, and not the other forms.
 */
const GroupFields = memo(function GroupFields({
  index,
  several,
  initial,
  state,
  options,
  onChange,
}: {
  index: number;
  several: boolean;
  initial: Initial;
  state: GroupState;
  options: MasterOptionDTO[];
  onChange: GroupUpdate;
}) {
  const t = useTranslations("database.bulkIdentity");
  const tIdentity = useTranslations("database.identity");
  const tMaster = useTranslations("masterData");

  const setValue = useCallback(
    (fieldKey: FieldKey, value: string) =>
      onChange(index, (previous) => ({ ...previous, values: { ...previous.values, [fieldKey]: value } })),
    [index, onChange]
  );
  const setSequential = useCallback(
    (sequential: boolean) => onChange(index, (previous) => ({ ...previous, sequential })),
    [index, onChange]
  );

  // Built once per form, not on every keystroke: a new list makes the picker
  // rebuild its items.
  const itemsByKey = useMemo(
    () =>
      Object.fromEntries(
        PICKERS.map(({ key, kind }) => {
          const items: Record<string, string> = {
            ...(initial[key].mixed ? { [MIXED]: t("mixedOption") } : {}),
            [NONE]: t("emptyOption"),
            ...Object.fromEntries(
              options
                .filter((option) => option.kind === kind && option.isActive)
                .map((option) => [option.id, option.code])
            ),
          };
          // A code retired since these records were made still shows as itself.
          const start = initial[key].start;
          if (!items[start]) items[start] = options.length === 0 ? "…" : start;
          return [key, items];
        })
      ) as Record<PickerKey, Record<string, string>>,
    [initial, options, t]
  );

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @2xl:grid-cols-3">
        {PICKERS.map(({ key: fieldKey, kind }) => (
          <PickerField
            key={fieldKey}
            index={index}
            fieldKey={fieldKey}
            label={tMaster(`kind.${kind}`)}
            value={state.values[fieldKey]}
            start={initial[fieldKey].start}
            mixed={initial[fieldKey].mixed}
            items={itemsByKey[fieldKey]}
            onSet={setValue}
          />
        ))}
        {TEXTS.map(({ key: fieldKey, numeric }) => (
          <TextField
            key={fieldKey}
            index={index}
            fieldKey={fieldKey}
            label={tIdentity(fieldKey)}
            numeric={numeric}
            value={state.values[fieldKey]}
            start={initial[fieldKey].start}
            mixed={initial[fieldKey].mixed}
            onSet={setValue}
            sequential={fieldKey === "sampleNo" && several ? state.sequential : undefined}
            onSequential={setSequential}
          />
        ))}
      </div>
    </div>
  );
});

interface FieldProps {
  index: number;
  fieldKey: FieldKey;
  label: string;
  value: string;
  start: string;
  mixed: boolean;
  onSet: (fieldKey: FieldKey, value: string) => void;
}

/**
 * A field with its label, and -- on the same line, so nothing below moves
 * when it appears -- what is about to happen to it and an Undo.
 */
function FieldFrame({
  index,
  fieldKey,
  label,
  status,
  onRevert,
  children,
}: {
  index: number;
  fieldKey: FieldKey;
  label: string;
  status: Status;
  onRevert: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("database.bulkIdentity");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center gap-2">
        <Label htmlFor={`bulk-ident-${index}-${fieldKey}`} className="min-w-0 truncate">
          {label}
        </Label>
        {status !== "keep" ? (
          <span className="ml-auto flex shrink-0 animate-in items-center gap-1 duration-150 fade-in-0">
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] leading-4 font-medium",
                status === "set" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              )}
            >
              {status === "set" ? t("changed") : status === "clear" ? t("cleared") : t("invalidNumber")}
            </span>
            <button
              type="button"
              onClick={onRevert}
              aria-label={t("revert")}
              title={t("revert")}
              className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IoArrowUndoOutline aria-hidden className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** The changed field's outline, eased in rather than switched on. */
function ringFor(status: Status) {
  const ease = "transition-[color,background-color,border-color,box-shadow] duration-150";
  if (status === "keep") return ease;
  return cn(ease, status === "set" ? "ring-2 ring-primary/40" : "ring-2 ring-destructive/40");
}

const PickerField = memo(function PickerField({
  index,
  fieldKey,
  label,
  value,
  start,
  mixed,
  items,
  onSet,
}: FieldProps & { items: Record<string, string> }) {
  const status = fieldStatus(fieldKey, value, start, mixed);
  return (
    <FieldFrame index={index} fieldKey={fieldKey} label={label} status={status} onRevert={() => onSet(fieldKey, start)}>
      {/* Not modal: the dialog already is, and a modal picker locks the page
          scroll, which reflows the whole table behind on every open. */}
      <Select
        modal={false}
        value={value}
        items={items}
        onValueChange={(next) => onSet(fieldKey, typeof next === "string" ? next : NONE)}
      >
        <SelectTrigger id={`bulk-ident-${index}-${fieldKey}`} className={cn("w-full", ringFor(status))}>
          <SelectValue>{(selected) => items[selected as string] ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {Object.entries(items).map(([itemValue, itemLabel]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldFrame>
  );
});

const TextField = memo(function TextField({
  index,
  fieldKey,
  label,
  numeric,
  value,
  start,
  mixed,
  onSet,
  sequential,
  onSequential,
}: FieldProps & {
  numeric: boolean;
  /** Only on the sample number of a form for several records. */
  sequential?: boolean;
  onSequential: (sequential: boolean) => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const status = fieldStatus(fieldKey, value, start, mixed);
  const mode = numeric ? "numeric" : undefined;
  const placeholder = mixed ? t("mixedPlaceholder") : undefined;
  return (
    <FieldFrame index={index} fieldKey={fieldKey} label={label} status={status} onRevert={() => onSet(fieldKey, start)}>
      <Input
        id={`bulk-ident-${index}-${fieldKey}`}
        inputMode={mode}
        placeholder={placeholder}
        aria-invalid={status === "invalid"}
        className={ringFor(status)}
        value={value}
        onChange={(event) => onSet(fieldKey, event.target.value)}
      />
      {/* Sample numbers differ from record to record by nature: one typed for
          several records is where the numbering starts. */}
      {sequential !== undefined ? (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 accent-primary"
            checked={sequential}
            onChange={(event) => onSequential(event.target.checked)}
          />
          {t("numberSequentially")}
        </label>
      ) : null}
    </FieldFrame>
  );
});
