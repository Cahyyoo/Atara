"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AnnouncementDTO } from "@/types";
import { IoClose, IoInformationCircleOutline, IoWarningOutline } from "react-icons/io5";

const DISMISSED_KEY = "atara:dismissed-announcements";

const listeners = new Set<() => void>();

/** Where closes are kept when storage refuses them, so the button still works. */
let fallback: string | null = null;

/** The stored list as text: a string, so React can compare snapshots cheaply. */
function snapshot(): string {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) ?? fallback ?? "[]";
  } catch {
    return fallback ?? "[]";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The ids this browser has closed. Storage can be missing or refuse; then nothing is. */
function parse(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  // Only the last fifty: old ids belong to announcements that have ended.
  const value = JSON.stringify(ids.slice(-50));
  fallback = value;
  try {
    window.localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // Private mode or full storage: closed for now, back on the next visit.
  }
  listeners.forEach((listener) => listener());
}

/**
 * The administrator's announcements, above every page.
 *
 * A warning stays until it ends -- that is what makes it a warning. An info
 * line can be closed, and stays closed in this browser.
 */
export function AnnouncementBanner({ announcements }: { announcements: AnnouncementDTO[] }) {
  const t = useTranslations("announcements");
  // The server (no storage) shows everything; once hydrated, the browser hides
  // what it has already closed, without a hydration mismatch.
  const dismissed = parse(useSyncExternalStore(subscribe, snapshot, () => "[]"));

  const visible = announcements.filter(
    (announcement) => announcement.tone === "WARNING" || !dismissed.includes(announcement.id)
  );
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    writeDismissed([...dismissed, id]);
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 sm:px-6">
      {visible.map((announcement) => {
        const warning = announcement.tone === "WARNING";
        const Icon = warning ? IoWarningOutline : IoInformationCircleOutline;
        return (
          <div
            key={announcement.id}
            role={warning ? "alert" : "status"}
            className={cn(
              "mx-auto flex w-full max-w-7xl items-start gap-3 rounded-xl border px-4 py-2.5 text-sm",
              warning
                ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                : "border-primary/30 bg-primary/5 text-foreground"
            )}
          >
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1 whitespace-pre-line">{announcement.message}</p>
            {warning ? null : (
              <button
                type="button"
                onClick={() => dismiss(announcement.id)}
                className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("dismiss")}
              >
                <IoClose className="size-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
