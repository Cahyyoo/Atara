"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { formatSessionTime } from "@/core/lib/auth/session-client";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { useVisibleInterval } from "@/core/hooks/use-visible-interval";
import type { StageBoard } from "@/modules/lab/lib/stages/stage-board";
import type { ApiResult } from "@/core/types";
import { APP_NAME } from "@/core/lib/app/brand";
import { IoExpandOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/** A wall monitor is always visible, so this is simply once a minute. */
export const TV_REFRESH_MS = 60_000;

/** How many of the longest-waiting samples the list shows. */
const LONGEST = 10;

/** "31 h" under two days, "3 d 4 h" beyond, so a stuck sample reads as stuck. */
export function formatWait(hours: number, t: (key: string, values: Record<string, number>) => string) {
  if (hours < 48) return t("hours", { hours: Math.round(hours) });
  return t("days", { days: Math.floor(hours / 24), hours: Math.round(hours % 24) });
}

/**
 * The lab's wall monitor: the floor right now in numbers big enough to read
 * from across the room. Same data as the stage board, refreshed once a
 * minute. Without the app shell there is no SessionWatch, so a session that
 * ends is noticed here, on the next refresh, and said in the middle of the
 * screen.
 */
export function TvDashboard({ initialBoard }: { initialBoard: StageBoard }) {
  const t = useTranslations("tv");
  const tStages = useTranslations("stages");
  const [board, setBoard] = useState(initialBoard);
  const [expired, setExpired] = useState(false);
  // Starts from the server's time, so the first render matches on both sides.
  const [now, setNow] = useState(initialBoard.generatedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useVisibleInterval(() => {
    void (async () => {
      try {
        const response = await fetch(withBasePath("/api/samples/board"), { cache: "no-store" });
        if (response.status === 401) {
          setExpired(true);
          return;
        }
        const body: ApiResult<StageBoard> = await response.json();
        if (body.success) setBoard(body.data);
      } catch {
        // Offline for a moment: keep the last figures up.
      }
    })();
  }, TV_REFRESH_MS);

  const columnLabel = (column: StageBoard["columns"][number]) =>
    stageLabel(tStages, column.stageKey, column.stageName ?? "");

  const inStages = board.columns.filter((column) => column.kind === "stage");
  const done = board.columns.find((column) => column.kind === "done");
  const inProgress = inStages.reduce((sum, column) => sum + column.count, 0);
  const overdue = board.columns.reduce((sum, column) => sum + column.overdue, 0);

  const longest = board.columns
    .flatMap((column) =>
      column.cards
        .filter((card) => card.overdue)
        .map((card) => ({ ...card, where: columnLabel(column) }))
    )
    .sort((a, b) => b.hours - a.hours)
    .slice(0, LONGEST);

  const kpis = [
    { label: t("inProgress"), value: inProgress, alarm: false },
    { label: t("overdue", { hours: board.slaHours }), value: overdue, alarm: overdue > 0 },
    { label: t("done"), value: done?.count ?? 0, alarm: false },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-neutral-50 lg:p-10">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{APP_NAME}</h1>
        <p className="text-xl text-neutral-400 lg:text-2xl">{t("title")}</p>
        <div className="ml-auto flex items-center gap-6">
          <p className="text-right">
            <span className="block font-mono text-4xl font-semibold tabular-nums lg:text-5xl">
              {formatWitaDateTime(now)?.slice(11, 16)}
            </span>
            <span className="text-sm text-neutral-400">
              {t("updated", { time: formatSessionTime(board.generatedAt) })}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="rounded-xl border border-neutral-700 p-3 text-neutral-300 hover:bg-neutral-800"
            aria-label={t("fullscreen")}
            title={t("fullscreen")}
          >
            <IoExpandOutline className="size-6" />
          </button>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              "rounded-2xl border p-6",
              kpi.alarm ? "border-red-500/60 bg-red-500/15" : "border-neutral-800 bg-neutral-900"
            )}
          >
            <p className="text-lg text-neutral-400 lg:text-xl">{kpi.label}</p>
            <p
              className={cn(
                "mt-2 text-6xl font-semibold tabular-nums lg:text-7xl",
                kpi.alarm && "text-red-400"
              )}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xl text-neutral-400">{t("byStage")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {board.columns.map((column) => (
            <div key={column.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="truncate text-lg text-neutral-300">{columnLabel(column)}</p>
              <p className="mt-1 text-5xl font-semibold tabular-nums">{column.count}</p>
              <p
                className={cn(
                  "mt-1 text-base",
                  column.overdue > 0 ? "text-red-400" : "text-neutral-500"
                )}
              >
                {column.kind === "done" ? t("last24h") : t("overdueShort", { count: column.overdue })}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl text-neutral-400">{t("longest")}</h2>
        {longest.length === 0 ? (
          <p className="mt-3 text-2xl text-emerald-400">{t("allClear")}</p>
        ) : (
          <ol className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
            {longest.map((card) => (
              <li
                key={card.sampleCode}
                className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xl"
              >
                <span className="font-mono font-semibold">{card.sampleCode}</span>
                <span className="truncate text-neutral-400">{card.where}</span>
                <span className="ml-auto font-semibold tabular-nums text-red-400">
                  {formatWait(card.hours, t)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {expired ? (
        <div
          role="alertdialog"
          aria-label={t("expired")}
          className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-neutral-950/90 text-center"
        >
          <p className="text-3xl font-semibold">{t("expired")}</p>
          <a
            href={withBasePath("/login?next=/tv")}
            className="rounded-xl bg-white px-6 py-3 text-xl font-medium text-neutral-950"
          >
            {t("signInAgain")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
