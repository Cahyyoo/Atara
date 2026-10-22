"use client";

import { useFormatter, useTranslations } from "next-intl";
import { StatTile } from "@/core/components/feedback/stat-tile";
import type { ImportDone } from "@/modules/eksplorasi/components/import/use-data-source-import";
import { IoCheckmarkCircleOutline } from "react-icons/io5";

/** Step 3: the write, as a bar filling up chunk by chunk. */
export function ImportProgress({ done, total }: { done: number; total: number }) {
  const t = useTranslations("dataSource.import");
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("progress", { done: format.number(done), total: format.number(total) })}
      </p>
    </div>
  );
}

/** Step 4: what was written, what was left alone, what was wrong. */
export function ImportResult({ result }: { result: ImportDone }) {
  const t = useTranslations("dataSource.import");
  const format = useFormatter();
  const n = (value: number) => format.number(value);
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <IoCheckmarkCircleOutline className="size-10 text-primary" />
      <p className="text-base font-medium">{t("doneTitle")}</p>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t("summary.created")} value={n(result.created)} />
        <StatTile label={t("summary.updated")} value={n(result.updated)} />
        <StatTile label={t("summary.skipped")} value={n(result.skipped)} />
        <StatTile label={t("summary.invalid")} value={n(result.invalid)} tone={result.invalid ? "error" : undefined} />
      </div>
    </div>
  );
}
