"use client";

import { useTranslations } from "next-intl";
import type { YtdProduction, YtdRow } from "@/modules/lab/lib/analytics/ytd-types";

const grade = (value: number | null) => (value === null ? "—" : value.toFixed(2));

/**
 * The year so far, one card per place: production first, then each
 * non-production code, with the samples taken, how many are assayed, and the
 * average Ni and Fe. Large enough to read from across the room.
 */
export function TvYtd({ ytd }: { ytd: YtdProduction | null }) {
  const t = useTranslations("tv");
  const places = new Map<string | null, YtdRow[]>();
  for (const row of ytd?.rows ?? []) places.set(row.place, [...(places.get(row.place) ?? []), row]);

  return (
    <section className="mt-8">
      <h2 className="text-xl text-neutral-400">{t("ytdTitle", { year: ytd?.year ?? new Date().getFullYear() })}</h2>
      {!ytd ? (
        <p className="mt-3 text-2xl text-neutral-500">—</p>
      ) : places.size === 0 ? (
        <p className="mt-3 text-2xl text-neutral-500">{t("ytdEmpty")}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {[...places].map(([place, rows]) => (
            <div key={place ?? "none"} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-2xl font-semibold">{place ?? t("noPlace")}</p>
              <table className="mt-2 w-full text-lg">
                <thead>
                  <tr className="text-left text-sm text-neutral-500">
                    <th className="py-1 font-normal">{t("code")}</th>
                    <th className="py-1 text-right font-normal">{t("samples")}</th>
                    <th className="py-1 text-right font-normal">{t("assayed")}</th>
                    <th className="py-1 text-right font-normal">{t("avgNi")}</th>
                    <th className="py-1 text-right font-normal">{t("avgFe")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.code ?? "production"} className="border-t border-neutral-800">
                      <td className="py-1.5 font-medium">{row.code ?? t("production")}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.samples}</td>
                      <td className="py-1.5 text-right tabular-nums text-neutral-400">{row.assayed}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{grade(row.ni)}</td>
                      <td className="py-1.5 text-right tabular-nums">{grade(row.fe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
