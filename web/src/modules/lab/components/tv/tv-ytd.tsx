"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { YtdProduction } from "@/modules/lab/lib/analytics/ytd-types";

/**
 * The year so far, kept to one line at the foot of the screen: how many
 * samples each place took, production and each non-production code. The
 * work to do is what the screen is for; this is the backdrop.
 */
export function TvYtd({ ytd }: { ytd: YtdProduction | null }) {
  const t = useTranslations("tv");
  const format = useFormatter();

  return (
    <section
      aria-label={t("ytdTitle", { year: ytd?.year ?? "" })}
      className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-lg"
    >
      <span className="font-semibold text-neutral-300">{t("ytdTitle", { year: ytd?.year ?? "" })}</span>
      {!ytd ? (
        <span className="text-neutral-500">—</span>
      ) : ytd.rows.length === 0 ? (
        <span className="text-neutral-500">{t("ytdEmpty")}</span>
      ) : (
        ytd.rows.map((row) => (
          <span
            key={`${row.place ?? ""}|${row.code ?? ""}`}
            data-ytd
            className="rounded-full bg-neutral-800 px-3 py-0.5 text-neutral-200"
          >
            <span className="text-neutral-400">
              {row.place ?? "—"} · {row.code ?? t("production")}
            </span>{" "}
            <span className="font-semibold tabular-nums">{format.number(row.samples)}</span>
          </span>
        ))
      )}
    </section>
  );
}
