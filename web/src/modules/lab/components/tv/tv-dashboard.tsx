"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { formatSessionTime } from "@/core/lib/auth/session-client";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { useVisibleInterval } from "@/core/hooks/use-visible-interval";
import type { StageBoard } from "@/modules/lab/lib/stages/stage-board";
import type { YtdProduction } from "@/modules/lab/lib/analytics/ytd-types";
import { TvYtd } from "@/modules/lab/components/tv/tv-ytd";
import { TvTodoBoard } from "@/modules/lab/components/tv/tv-todo-board";
import type { ApiResult } from "@/core/types";
import { APP_NAME } from "@/core/lib/app/brand";
import { IoExpandOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/** A wall monitor is always visible, so this is simply once a minute. */
export const TV_REFRESH_MS = 60_000;

export { formatWait } from "@/modules/lab/components/tv/tv-format";

/**
 * The lab's wall monitor: the work waiting on the floor, stage by stage, in
 * type big enough to read from across the room, with the day's three numbers
 * above it and the year so far in one line beneath. Same data as the stage
 * board, refreshed once a minute. Without the app shell there is no
 * SessionWatch, so a session that ends is noticed here, on the next refresh,
 * and said in the middle of the screen.
 */
export function TvDashboard({
  initialBoard,
  initialYtd = null,
}: {
  initialBoard: StageBoard;
  /** The year so far per place and production code; null until it could be read. */
  initialYtd?: YtdProduction | null;
}) {
  const t = useTranslations("tv");
  const [board, setBoard] = useState(initialBoard);
  const [ytd, setYtd] = useState(initialYtd);
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
    void (async () => {
      try {
        const response = await fetch(withBasePath("/api/samples/ytd"), { cache: "no-store" });
        const body: ApiResult<YtdProduction> = await response.json();
        if (body.success) setYtd(body.data);
      } catch {
        // The year's table keeps its last figures, as the board does.
      }
    })();
  }, TV_REFRESH_MS);

  const inStages = board.columns.filter((column) => column.kind === "stage");
  const done = board.columns.find((column) => column.kind === "done");
  const inProgress = inStages.reduce((sum, column) => sum + column.count, 0);
  const overdue = board.columns.reduce((sum, column) => sum + column.overdue, 0);

  const kpis = [
    { label: t("inProgress"), value: inProgress, alarm: false },
    { label: t("overdue", { hours: board.slaHours }), value: overdue, alarm: overdue > 0 },
    { label: t("done"), value: done?.count ?? 0, alarm: false },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 p-6 text-neutral-50 lg:p-8">
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

      {/* The day in three numbers, kept small: the work below is what the screen is for. */}
      <section className="mt-6 grid grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={cn(
              "flex items-baseline gap-4 rounded-2xl border px-5 py-3",
              kpi.alarm ? "border-red-500/60 bg-red-500/15" : "border-neutral-800 bg-neutral-900"
            )}
          >
            <p className="text-lg text-neutral-400">{kpi.label}</p>
            <p className={cn("ml-auto text-4xl font-semibold tabular-nums", kpi.alarm && "text-red-400")}>
              {kpi.value}
            </p>
          </div>
        ))}
      </section>

      <TvTodoBoard board={board} />

      <TvYtd ytd={ytd} />

      {expired ? (
        <div
          role="alertdialog"
          aria-label={t("expired")}
          className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-neutral-950/90 text-center"
        >
          <p className="text-3xl font-semibold">{t("expired")}</p>
          <a
            href={withBasePath("/login?next=/lab/tv")}
            className="rounded-xl bg-white px-6 py-3 text-xl font-medium text-neutral-950"
          >
            {t("signInAgain")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
