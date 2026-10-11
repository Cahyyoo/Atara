"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/stages";
import { isExactMatch, normalizeLookupQuery } from "@/lib/sample-lookup";
import type { ApiResult, SampleLookupDTO } from "@/types";
import { IoReloadOutline, IoSearchOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

/** A pause in typing long enough to be worth a request. */
export const LOOKUP_DEBOUNCE_MS = 200;

type Lookup =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "done"; query: string; results: SampleLookupDTO[] }
  | { status: "error"; query: string };

/** Whether a key press landed somewhere that is already taking text. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

async function lookup(query: string, signal?: AbortSignal): Promise<SampleLookupDTO[]> {
  const response = await fetch(withBasePath(`/api/samples/lookup?q=${encodeURIComponent(query)}`), { signal });
  const body: ApiResult<{ results: SampleLookupDTO[] }> = await response.json();
  if (!body.success) throw new Error(body.error);
  return body.data.results;
}

/**
 * Ctrl+K (or "/"): one box that opens any sample by barcode, lab code or a
 * piece of its Sample ID, from any page.
 *
 * A USB barcode scanner types the code and presses Enter faster than the
 * debounce, so Enter never waits for it: it asks straight away, and an exact
 * hit opens without a further keystroke.
 */
export function QuickSearch() {
  const t = useTranslations("search");
  const tStages = useTranslations("stages");
  const tStatus = useTranslations("samples.status");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<Lookup>({ status: "idle" });
  const [active, setActive] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const query = normalizeLookupQuery(text);
  const results = state.status === "done" && state.query === query ? state.results : [];

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !event.ctrlKey && !event.metaKey && !isTyping(event.target);
      if (isShortcut || isSlash) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function run(target: string, signal: AbortSignal): Promise<SampleLookupDTO[] | null> {
    setState({ status: "loading", query: target });
    try {
      const found = await lookup(target, signal);
      setState({ status: "done", query: target, results: found });
      setActive(0);
      return found;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return null;
      setState({ status: "error", query: target });
      return null;
    }
  }

  function search(target: string | null) {
    inFlight.current?.abort();
    if (!target) return null;
    const controller = new AbortController();
    inFlight.current = controller;
    return run(target, controller.signal);
  }

  useEffect(() => {
    if (!open || !query) return;
    const timer = setTimeout(() => void search(query), LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `search` is recreated each render and only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query]);

  function close() {
    inFlight.current?.abort();
    setOpen(false);
    setText("");
    setState({ status: "idle" });
    setActive(0);
  }

  function go(sampleCode: string) {
    close();
    router.push(`/samples/${encodeURIComponent(sampleCode)}`);
  }

  async function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + results.length) % results.length);
      return;
    }
    if (event.key !== "Enter" || !query) return;
    event.preventDefault();

    if (results.length > 0) {
      go(results[Math.min(active, results.length - 1)].sampleCode);
      return;
    }
    // Faster than the debounce -- a scanner, or somebody who knows the code.
    const found = await search(query);
    if (found && found.length > 0 && isExactMatch(query, found[0])) {
      go(found[0].sampleCode);
    }
  }

  const listId = "quick-search-results";
  const optionId = (index: number) => `quick-search-option-${index}`;

  return (
    <>
      <Button
        variant="outline"
        className="h-9 gap-2 px-2.5 text-muted-foreground sm:w-56 sm:justify-start" data-tour="quick-search"
        aria-label={t("open")}
        onClick={() => setOpen(true)}
      >
        <IoSearchOutline className="size-4" />
        <span className="hidden flex-1 text-left text-sm sm:inline">{t("open")}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[10px] font-medium sm:inline">
          {t("shortcut")}
        </kbd>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">{t("open")}</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <IoSearchOutline aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
              aria-label={t("placeholder")}
              placeholder={t("placeholder")}
              autoComplete="off"
              spellCheck={false}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => void onKeyDown(event)}
            />
            {state.status === "loading" ? (
              <IoReloadOutline aria-hidden className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {!query ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("minChars")}</p>
            ) : state.status === "error" && state.query === query ? (
              <p className="px-2 py-6 text-center text-sm text-destructive">{t("error")}</p>
            ) : state.status === "done" && state.query === query && results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul id={listId} role="listbox" aria-label={t("open")} className="flex flex-col gap-0.5">
                {results.map((result, index) => (
                  <li
                    key={result.sampleCode}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                      index === active ? "bg-muted" : "hover:bg-muted/60"
                    )}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(result.sampleCode)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tabular-nums">{result.sampleCode}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[result.labCode, result.sampleIdent].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {result.stageName
                        ? stageLabel(tStages, result.stageKey, result.stageName)
                        : tStatus(result.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("hint")}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
