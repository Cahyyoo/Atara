"use client";

import { useTranslations } from "next-intl";
import { IoReloadOutline } from "react-icons/io5";
import { STAGE_PARTS, stageColumnKey, type ExportColumnSpec, type StagePart } from "@/modules/lab/lib/records/export-columns";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import type { StageDTO } from "@/modules/lab/types";

/**
 * The export's stage matrix: for each stage, when the sample entered it, how
 * long it stayed and who scanned it -- plus the columns that go with the
 * stage dates, such as the lead time.
 */
export function StageColumns({
  stages,
  extras,
  chosen,
  onToggle,
}: {
  /** Null while they are still being read. */
  stages: StageDTO[] | null;
  extras: readonly ExportColumnSpec[];
  chosen: ReadonlySet<string>;
  onToggle: (keys: string[], on: boolean) => void;
}) {
  const t = useTranslations("exportDialog");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const partLabel: Record<StagePart, string> = { at: t("entered"), duration: t("hours"), by: t("operator") };
  const stageIds = (stages ?? []).map((stage) => stage.id);

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border p-3">
      <legend className="text-sm font-medium">{t("stages")}</legend>
      {stages === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <IoReloadOutline aria-hidden className="size-4 animate-spin" />
          {tCommon("loading")}
        </p>
      ) : stages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noStages")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">{t("stage")}</th>
              {STAGE_PARTS.map((part) => {
                const keys = stageIds.map((id) => stageColumnKey(id, part));
                const all = keys.every((key) => chosen.has(key));
                return (
                  <th key={part} className="py-1 text-center font-normal">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={all}
                        aria-label={t("allOf", { part: partLabel[part] })}
                        onChange={() => onToggle(keys, !all)}
                      />
                      {partLabel[part]}
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const name = stageLabel(tStages, stage.key, stage.name);
              return (
                <tr key={stage.id} className="border-t">
                  <td className="py-1.5">{name}</td>
                  {STAGE_PARTS.map((part) => {
                    const key = stageColumnKey(stage.id, part);
                    return (
                      <td key={part} className="py-1.5 text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={`${partLabel[part]} ${name}`}
                          checked={chosen.has(key)}
                          onChange={(event) => onToggle([key], event.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {extras.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-2">
          {extras.map((column) => (
            <label key={column.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={chosen.has(column.key)}
                onChange={(event) => onToggle([column.key], event.target.checked)}
              />
              {column.header}
            </label>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
