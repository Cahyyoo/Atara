"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import type { StageBoard } from "@/modules/lab/lib/stages/stage-board";
import { formatWait } from "@/modules/lab/components/tv/tv-format";

/** Samples per column before "+N more": what fits a 1080p screen without scrolling. */
export const TODO_CARDS = 12;

/**
 * The work on the floor, one column per stage still to go through: each
 * sample sitting there, longest-waiting first, red once past the SLA. What the
 * lab reads from across the room to know what to pick up next.
 */
export function TvTodoBoard({ board }: { board: StageBoard }) {
  const t = useTranslations("tv");
  const tStages = useTranslations("stages");
  const stages = board.columns.filter((column) => column.kind === "stage");

  return (
    <section className="mt-6 flex min-h-0 flex-1 flex-col">
      <h2 className="text-xl text-neutral-400">{t("todoTitle")}</h2>
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((column) => {
          const shown = column.cards.slice(0, TODO_CARDS);
          const more = column.count - shown.length;
          return (
            <div
              key={column.id}
              aria-label={stageLabel(tStages, column.stageKey, column.stageName ?? "")}
              role="region"
              className="flex min-h-0 flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="flex items-baseline gap-3 border-b border-neutral-800 pb-3">
                <p className="truncate text-xl font-semibold">
                  {stageLabel(tStages, column.stageKey, column.stageName ?? "")}
                </p>
                <p className="ml-auto text-4xl font-semibold tabular-nums">{column.count}</p>
              </div>
              {column.overdue > 0 ? (
                <p className="mt-2 text-base font-medium text-red-400">{t("overdueShort", { count: column.overdue })}</p>
              ) : null}
              {shown.length === 0 ? (
                <p className="mt-4 text-lg text-emerald-400/80">{t("stageEmpty")}</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2 overflow-hidden">
                  {shown.map((card) => (
                    <li
                      key={card.sampleCode}
                      data-overdue={card.overdue ? "" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2",
                        card.overdue ? "border-red-500/60 bg-red-500/15" : "border-neutral-800 bg-neutral-950"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-lg font-semibold">{card.sampleCode}</p>
                        <p className={cn("truncate text-sm", card.sampleIdent ? "text-neutral-300" : "text-neutral-500")}>
                          {card.sampleIdent ?? t("noIdent")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-lg font-semibold tabular-nums",
                          card.overdue ? "text-red-400" : "text-neutral-400"
                        )}
                      >
                        {formatWait(card.hours, t)}
                      </span>
                    </li>
                  ))}
                  {more > 0 ? <li className="px-3 text-base text-neutral-500">{t("more", { count: more })}</li> : null}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
