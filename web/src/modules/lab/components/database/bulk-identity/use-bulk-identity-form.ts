"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import { useMasterOptions } from "@/modules/lab/hooks/use-master-options";
import type { ApiResult } from "@/core/types";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import {
  COMPACT_FROM,
  freshState,
  groupBySampleIdent,
  groupRequest,
  initialOf,
  type GroupState,
  type GroupUpdate,
  type Mark,
  type Preview,
} from "@/modules/lab/components/database/bulk-identity/identity-plan";

/** A pause in typing long enough to ask what the Sample IDs would become. */
const PREVIEW_DEBOUNCE_MS = 400;

/** What a save would do now, in one line. */
export interface StatusLine {
  text: ReactNode;
  tone: "muted" | "error" | "ok";
}

/** Everything one opening of the dialog keeps: the forms, the list, the preview and the save. */
export function useBulkIdentityForm({
  records,
  onBusy,
  onSaved,
}: {
  records: LabRecordListItemDTO[];
  onBusy: (busy: boolean) => void;
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

  /** What a save would do now, in one line. */
  const status: StatusLine = error
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

  return {
    options,
    groups,
    initials,
    togetherInitial,
    several,
    mode,
    setMode,
    together,
    eachStates,
    togetherState,
    changeEach,
    changeTogether,
    setActive,
    query,
    setQuery,
    onlyChanged,
    setOnlyChanged,
    previewOpen,
    setPreviewOpen,
    marks,
    visible,
    shownActive,
    position,
    checking,
    shown,
    clashes,
    ready,
    showPreview,
    changedFields,
    otherModeChanged,
    save,
    status,
  };
}
