// Rendered only from the sample detail page, and nothing here is interactive:
// keeping it on the server keeps the audit history out of the RSC payload.
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import { moistureContent } from "@/modules/lab/lib/records/mc";
import { LabRecordIdentity } from "@/modules/lab/components/samples/lab-record-identity";
import { prisma } from "@/core/lib/prisma";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { MasterKind } from "@/modules/lab/types";
import type { LabRecordAuditDTO, LabRecordDTO } from "@/modules/lab/types";

/** The audit stores the master option's id; the reader needs its code. */
const IDENTITY_KINDS: Record<string, MasterKind> = {
  placeId: "PLACE",
  rockTypeId: "ROCK_TYPE",
  nonProdId: "NON_PROD",
  pitId: "PIT",
  sirId: "SIR",
};

/** The five identity columns, in the order the Sample ID composes them. */
const IDENTITY_OPTION_FIELDS = [
  "placeId",
  "rockTypeId",
  "nonProdId",
  "sirId",
  "pitId",
] as const satisfies readonly (keyof LabRecordDTO)[];

/** Counted, not measured — so no decimal places. */
const COUNT_FIELDS = new Set(["sequenceNo", "sampleNo", "sackCount"]);

function isAssay(key: string): boolean {
  return ASSAY_FIELDS.some((field) => field.key === key);
}

/** Assay results are measured to three places; the grid always shows all three. */
function formatAssay(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

interface LabRecordPanelProps {
  record: LabRecordDTO;
  audits: LabRecordAuditDTO[];
  /** The change history: viewRecordHistory in permissions.ts. */
  showHistory: boolean;
  lastEditedBy: string | null;
}

export async function LabRecordPanel({
  record,
  audits,
  showHistory,
  lastEditedBy,
}: LabRecordPanelProps) {
  const t = await getTranslations("samples.labRecord");
  const tDetail = await getTranslations("samples.detail");
  const tDatabase = await getTranslations("database");
  const tIdentity = await getTranslations("database.identity");
  const tMaster = await getTranslations("masterData");
  const format = await getFormatter();
  const formatDateTime = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
  const mc = moistureContent(record.wp, record.w0, record.wd);
  // The weighing is a result too: its cards show even before the assay is in.
  const weighed = record.wp !== null || record.w0 !== null || record.wd !== null;
  const hasResults = weighed || ASSAY_FIELDS.some((field) => record[field.key] !== null);
  /** The moisture-content weighing and what it comes to, after the elements. */
  const mcCards = [
    { key: "wp", label: tDatabase("wp"), value: record.wp === null ? "—" : String(record.wp) },
    { key: "w0", label: tDatabase("w0"), value: record.w0 === null ? "—" : String(record.w0) },
    { key: "wd", label: tDatabase("wd"), value: record.wd === null ? "—" : String(record.wd) },
    { key: "mc", label: tDatabase("mc"), value: mc === null ? "—" : mc.toFixed(2) },
  ];

  // Both the identity below and the history store master options by id. Printed
  // raw that is a cuid, which tells the reader nothing — so every id either of
  // them mentions is read back in one query and shown as its code.
  const optionIds = [
    ...new Set([
      ...IDENTITY_OPTION_FIELDS.map((field) => record[field]).filter(
        (value): value is string => typeof value === "string"
      ),
      ...audits.flatMap((audit) =>
        Object.entries(audit.changes).flatMap(([key, change]) =>
          key in IDENTITY_KINDS
            ? [change.from, change.to].filter((value): value is string => typeof value === "string")
            : []
        )
      ),
    ]),
  ];
  const options = optionIds.length
    ? await prisma.masterOption.findMany({
        where: { id: { in: optionIds } },
        select: { id: true, code: true },
      })
    : [];
  const codeById = new Map(options.map((option) => [option.id, option.code]));

  function labelFor(key: string): string {
    const assay = ASSAY_FIELDS.find((field) => field.key === key);
    if (assay) return assay.label;

    const kind = IDENTITY_KINDS[key];
    if (kind) return tMaster(`kind.${kind}`);
    if (COUNT_FIELDS.has(key) || key === "bargingNo") return tIdentity(key);
    if (key === "sampleIdent") return tDatabase("sampleIdent");
    if (key === "remarks") return tDatabase("dialog.remarks");
    if (["measurementMethod", "solutionId", "measurementFinished", "xrayInstrument", "wp", "w0", "wd"].includes(key)) {
      return tDatabase(key);
    }
    return key;
  }

  function formatChange(key: string, value: number | string | null): string {
    if (value === null || value === "") return "—";

    // A retired option keeps its code; one deleted outright leaves only the id,
    // and showing that is better than pretending the change never happened.
    if (key in IDENTITY_KINDS && typeof value === "string") {
      return codeById.get(value) ?? value;
    }
    if (key === "measurementFinished") return formatWitaDateTime(String(value)) ?? String(value);
    if (typeof value !== "number") return value;
    // Counts and running numbers are integers: "25.000" reads as a thousand.
    return isAssay(key) ? value.toFixed(3) : String(value);
  }

  return (
    <>
      <Card data-tour="sample-labrecord">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("title")}</CardTitle>
          {/* The field identity in place of the old LAM/MOL chip: it names the
              place, rock type, pit and barging run all at once. */}
          {record.sampleIdent ? (
            <Badge variant="secondary" className="font-mono">
              {record.sampleIdent}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("labCode")}</p>
              <p className="font-mono text-sm font-medium">{record.labCode}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("shiftDay")}</p>
              <p className="text-sm font-medium">{record.shiftDate}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("sequence")}</p>
              <p className="text-sm font-medium">
                #{String(record.sequence).padStart(4, "0")}
              </p>
            </div>
          </div>

          <LabRecordIdentity record={record} codeById={codeById} />

          {hasResults ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ASSAY_FIELDS.map((field) => (
                <div key={field.key} className="rounded-lg border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="tabular-nums text-sm font-semibold">
                    {formatAssay(record[field.key])}
                  </p>
                </div>
              ))}
              {mcCards.map((card) => (
                <div key={card.key} className="rounded-lg border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="tabular-nums text-sm font-semibold">{card.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              {t("noResults")}
            </p>
          )}

          {record.remarks ? (
            <div>
              <p className="text-xs text-muted-foreground">{t("remarks")}</p>
              <p className="text-sm">{record.remarks}</p>
            </div>
          ) : null}

          {lastEditedBy ? (
            <p className="text-xs text-muted-foreground">
              {t("lastEditedBy", {
                name: lastEditedBy,
                date: formatDateTime(record.updatedAt),
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {showHistory && audits.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {audits.map((audit) => (
                <li key={audit.id} className="rounded-lg border px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {audit.changedBy.name}
                      {audit.subCode ? (
                        <Badge variant="secondary">↳ {tDatabase("subs.label", { code: audit.subCode })}</Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(audit.changedAt)}
                    </p>
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {Object.entries(audit.changes).map(([key, change]) => (
                      <li key={key} className="text-sm text-muted-foreground">
                        <span className="text-foreground">{labelFor(key)}</span>:{" "}
                        <span className="tabular-nums line-through">
                          {formatChange(key, change.from)}
                        </span>{" "}
                        → <span className="tabular-nums text-foreground">
                          {formatChange(key, change.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {audit.reason ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {tDetail("reason")} {audit.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
