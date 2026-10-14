import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@/core/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { StatusBadge } from "@/modules/lab/components/samples/status-badge";
import { SampleTimeline } from "@/modules/lab/components/samples/sample-timeline";
import { BackLink } from "@/modules/lab/components/samples/back-link";
import { LabRecordPanel } from "@/modules/lab/components/samples/lab-record-panel";
import { PrintLabelButton } from "@/modules/lab/components/samples/print-label-button";
import { CorrectStageButton } from "@/modules/lab/components/samples/correct-stage-dialog";
import { loadStages } from "@/modules/lab/lib/stages/stages-cache";
import { toLabRecordDTO } from "@/modules/lab/lib/records/lab-record";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { can } from "@/core/lib/auth/permissions";
import type { LabRecordAuditDTO, SampleListItemDTO } from "@/modules/lab/types";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import Link from "next/link";
import { subSamplePath } from "@/modules/lab/lib/samples/sample-ident";
import { ASSAY_FIELDS, formatAssayValue } from "@/modules/lab/lib/records/assay";
import { IoCalendarOutline, IoHourglassOutline, IoLayersOutline, IoPersonOutline } from "react-icons/io5";
import { leadTimeHours, stageMoments } from "@/modules/lab/lib/records/mc";

export const dynamic = "force-dynamic";

/** What each sub-sample shows in its sample's list; the rest is a click away. */
const SUB_SUMMARY_FIELDS = ["ni", "fe", "co", "sio2", "mgo"] as const;

export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await requireCapabilityPage("viewDashboard");
  const t = await getTranslations("samples.detail");
  const tSub = await getTranslations("samples.sub");
  const tSamples = await getTranslations("samples");
  const tStages = await getTranslations("stages");
  const format = await getFormatter();
  const canPrint = session ? can(session, "printLabels") : false;
  const canSeeHistory = session ? can(session, "viewRecordHistory") : false;
  const canCorrect = session ? can(session, "correctStage") : false;

  const sample = await prisma.sample.findUnique({
    where: { sampleCode: decodeURIComponent(code) },
    include: {
      currentStage: true,
      createdBy: { select: { id: true, name: true, email: true } },
      labRecord: {
        include: {
          updatedBy: { select: { name: true } },
          subs: { orderBy: { subCode: "asc" } },
        },
      },
      logs: {
        orderBy: { scannedAt: "asc" },
        include: {
          stage: true,
          operator: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!sample) {
    notFound();
  }

  // Only the administrator's correction needs the full list, and only for a
  // sample that still exists.
  const correctable = canCorrect && sample.deletedAt === null;
  const stages = correctable ? await loadStages() : [];

  // Receipt to report, from the scans already loaded: the same rule as the
  // Sample Database and the export (first Received, last Report).
  const stageIdOf = (key: string) => sample.logs.find((log) => log.stage.key === key)?.stageId;
  const { receivedAt, reportAt } = stageMoments(sample.logs, {
    receivedId: stageIdOf("RECEIVED"),
    reportId: stageIdOf("REPORT"),
  });
  const leadTime = leadTimeHours(receivedAt, reportAt);

  const logs = sample.logs.map((log) => ({
    id: log.id,
    sampleId: log.sampleId,
    stageId: log.stageId,
    stage: {
      id: log.stage.id,
      key: log.stage.key,
      name: log.stage.name,
      sequenceOrder: log.stage.sequenceOrder,
      description: log.stage.description,
    },
    operatorId: log.operatorId,
    operator: log.operator,
    notes: log.notes,
    isCorrection: log.isCorrection,
    scannedAt: log.scannedAt.toISOString(),
  }));

  const labelSample: SampleListItemDTO = {
    id: sample.id,
    sampleCode: sample.sampleCode,
    labCode: sample.labRecord?.labCode ?? null,
    sampleIdent: sample.labRecord?.sampleIdent ?? null,
    status: sample.status,
    currentStageId: sample.currentStageId,
    currentStage: sample.currentStage,
    createdBy: { id: sample.createdBy.id, name: sample.createdBy.name },
    createdAt: sample.createdAt.toISOString(),
    updatedAt: sample.updatedAt.toISOString(),
  };

  // The record's history and its sub-samples', together and newest first:
  // a fraction's results are part of what happened to this sample.
  const auditRows =
    canSeeHistory && sample.labRecord
      ? await prisma.labRecordAudit.findMany({
          where: { labRecordId: { in: [sample.labRecord.id, ...sample.labRecord.subs.map((sub) => sub.id)] } },
          orderBy: { changedAt: "desc" },
          take: 30,
          include: {
            changedBy: { select: { id: true, name: true, email: true } },
            labRecord: { select: { subCode: true } },
          },
        })
      : [];
  const audits: LabRecordAuditDTO[] = auditRows.map((audit) => ({
    id: audit.id,
    changedAt: audit.changedAt.toISOString(),
    changedBy: audit.changedBy,
    changes: audit.changes as LabRecordAuditDTO["changes"],
    reason: audit.reason,
    subCode: audit.labRecord.subCode,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackLink />
        <div data-tour="sample-header" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {sample.sampleCode}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">
              {sample.labRecord?.sampleIdent ?? sample.labRecord?.labCode ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {correctable ? (
              <CorrectStageButton
                sampleCode={sample.sampleCode}
                currentStageId={sample.currentStageId}
                stages={stages.map(({ id, key, name }) => ({ id, key, name }))}
              />
            ) : null}
            {canPrint ? <PrintLabelButton sample={labelSample} /> : null}
            <StatusBadge status={sample.status} />
          </div>
        </div>
      </div>

      <div data-tour="sample-summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoLayersOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tSamples("currentStage")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {sample.currentStage
                ? stageLabel(tStages, sample.currentStage.key, sample.currentStage.name)
                : tSamples("notStarted")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoPersonOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("createdBy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{sample.createdBy.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoCalendarOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("createdAt")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{format.dateTime(sample.createdAt, { dateStyle: "long", timeStyle: "short" })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoHourglassOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("leadTime")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold tabular-nums">
              {leadTime === null ? "—" : t("leadTimeValue", { hours: leadTime.toFixed(1) })}
            </p>
            <p className="text-xs text-muted-foreground">
              {leadTime === null ? t("leadTimePending") : t("leadTimeSpan")}
            </p>
          </CardContent>
        </Card>
      </div>

      {sample.labRecord ? (
        <LabRecordPanel
          record={toLabRecordDTO(sample.labRecord)}
          audits={audits}
          showHistory={canSeeHistory}
          lastEditedBy={sample.labRecord.updatedBy?.name ?? null}
        />
      ) : null}

      {/* The fractions taken from this sample, each with its own results and page. */}
      {sample.labRecord && sample.labRecord.subs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tSub("listTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {sample.labRecord.subs.map((sub) => (
                <li key={sub.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <Link
                    href={subSamplePath(sample.sampleCode, sub.subCode ?? "")}
                    className="font-medium text-primary hover:underline"
                  >
                    {tSub("title", { code: sub.subCode ?? "" })}
                  </Link>
                  <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums">
                    {SUB_SUMMARY_FIELDS.map((key) => {
                      const field = ASSAY_FIELDS.find((spec) => spec.key === key)!;
                      const value = sub[key];
                      return (
                        <span key={key}>
                          {field.shortLabel} {value === null ? "—" : formatAssayValue(Number(value), 3)}
                        </span>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card data-tour="sample-timeline">
        <CardHeader>
          <CardTitle>{t("timelineTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SampleTimeline logs={logs} />
        </CardContent>
      </Card>
    </div>
  );
}
