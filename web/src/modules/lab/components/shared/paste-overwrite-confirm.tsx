"use client";

import { useTranslations } from "next-intl";
import { IoWarningOutline } from "react-icons/io5";
import { labelFor } from "@/modules/lab/components/shared/paste-preview";
import { formatChange, type OverwriteEntry } from "@/modules/lab/components/shared/paste-from-excel-utils";

/** The results a save would replace, listed before anything is replaced. */
export function PasteOverwriteConfirm({ confirm }: { confirm: OverwriteEntry[] }) {
  const t = useTranslations("database.paste");
  const replacedCount = confirm.reduce((total, entry) => total + entry.fields.length, 0);

  return (
    // Results already there are replaced only on purpose.
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
        <IoWarningOutline className="size-4 shrink-0" />
        {t("overwriteTitle", { count: replacedCount, records: confirm.length })}
      </p>
      <p className="text-muted-foreground">{t("overwriteBody")}</p>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto font-mono text-xs">
        {confirm.map((entry) => (
          <li key={`${entry.targetId}-${entry.label}`} className="flex flex-wrap gap-x-3">
            <span className="font-semibold">{entry.label}</span>
            {entry.fields.map((field) => (
              <span key={field.field} className="whitespace-nowrap">
                {labelFor(field.field)} {formatChange(field.field, field.from)} →{" "}
                {formatChange(field.field, field.to)}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
