"use client";

import { useTranslations } from "next-intl";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { LabRecordDTO, MasterKind } from "@/modules/lab/types";

/** The five identity columns, in the order the Sample ID composes them. */
const OPTION_FIELDS: { field: keyof LabRecordDTO; kind: MasterKind }[] = [
  { field: "placeId", kind: "PLACE" },
  { field: "rockTypeId", kind: "ROCK_TYPE" },
  { field: "nonProdId", kind: "NON_PROD" },
  { field: "sirId", kind: "SIR" },
  { field: "pitId", kind: "PIT" },
];

/** The four typed numbers that follow them. */
const NUMBER_FIELDS = ["bargingNo", "sequenceNo", "sampleNo", "sackCount"] as const;

const DASH = <span className="text-muted-foreground">—</span>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{children}</p>
    </div>
  );
}

/**
 * The nine parts a Sample ID is built from, plus what the instrument reported
 * alongside the numbers. The moisture-content weighing sits with the results.
 *
 * Split out from the panel because the panel is an async server component that
 * reads the database — this half is pure, so the rule that matters here can be
 * tested: a master option is stored as an id, and printing that raw would put a
 * cuid on screen where a code belongs.
 */
export function LabRecordIdentity({
  record,
  codeById,
}: {
  record: LabRecordDTO;
  /** Master option id to code, resolved once by the panel above. */
  codeById: Map<string, string>;
}) {
  const t = useTranslations("database");
  const tIdentity = useTranslations("database.identity");
  const tMaster = useTranslations("masterData");

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tIdentity("title")}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {OPTION_FIELDS.map(({ field, kind }) => {
          const id = record[field];
          return (
            <Field key={field} label={tMaster(`kind.${kind}`)}>
              {/* A retired code still has to read: it sits inside every older
                  Sample ID, and its id alone tells nobody anything. */}
              {typeof id === "string" ? (codeById.get(id) ?? id) : DASH}
            </Field>
          );
        })}
        {NUMBER_FIELDS.map((field) => (
          <Field key={field} label={tIdentity(field)}>
            {record[field] ?? DASH}
          </Field>
        ))}
        <Field label={t("measurementMethod")}>{record.measurementMethod ?? DASH}</Field>
        <Field label={t("solutionId")}>{record.solutionId ?? DASH}</Field>
        <Field label={t("measurementFinished")}>
          {record.measurementFinished
            ? (formatWitaDateTime(record.measurementFinished) ?? DASH)
            : DASH}
        </Field>
        <Field label={t("xrayInstrument")}>{record.xrayInstrument ?? DASH}</Field>
      </div>
    </div>
  );
}
