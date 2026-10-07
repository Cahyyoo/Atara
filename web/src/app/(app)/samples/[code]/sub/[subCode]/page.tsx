import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/samples/status-badge";
import { BackLink } from "@/components/samples/back-link";
import { LabRecordPanel } from "@/components/samples/lab-record-panel";
import { toLabRecordDTO } from "@/lib/lab-record";
import { getActiveSession } from "@/lib/page-auth";
import { can } from "@/lib/permissions";
import { stageLabel } from "@/lib/stages";
import { subSamplePath } from "@/lib/sample-ident";
import { loadSubSampleDetail } from "@/lib/sub-sample-detail";
import type { LabRecordAuditDTO } from "@/types";
import { IoArrowUp, IoCalendarOutline, IoGitBranchOutline, IoLayersOutline } from "react-icons/io5";

export const dynamic = "force-dynamic";

/**
 * A sub-sample's own page: a fraction of a sample -- "(-20)" -- with results
 * of its own. It shares its sample's container, so its stage and status are
 * the sample's, shown as such; there is nothing of its own to print or scan.
 */
export default async function SubSampleDetailPage({
  params,
}: {
  params: Promise<{ code: string; subCode: string }>;
}) {
  const { code, subCode } = await params;
  const session = await getActiveSession();
  const t = await getTranslations("samples.sub");
  const tSamples = await getTranslations("samples");
  const tStages = await getTranslations("stages");
  const format = await getFormatter();
  const canSeeHistory = session ? can(session.role, "viewRecordHistory") : false;

  const detail = await loadSubSampleDetail(decodeURIComponent(code), decodeURIComponent(subCode));
  if (!detail) notFound();
  const { sample, parent, sub, others } = detail;

  const audits: LabRecordAuditDTO[] = canSeeHistory
    ? detail.audits.map((audit) => ({
        id: audit.id,
        changedAt: audit.changedAt.toISOString(),
        changedBy: audit.changedBy,
        changes: audit.changes as LabRecordAuditDTO["changes"],
        reason: audit.reason,
      }))
    : [];
  const parentHref = `/samples/${encodeURIComponent(sample.sampleCode)}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* Back to the list it was opened from, or up to its sample. */}
        <div className="flex flex-wrap items-center gap-x-5">
          <BackLink />
          <Link
            href={parentHref}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <IoArrowUp className="size-4" />
            {t("backTo", { code: sample.sampleCode })}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("title", { code: sub.subCode ?? "" })}</h1>
            <p className="font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {sub.sampleIdent ?? sub.labCode}
              {sub.sampleIdent ? ` · ${sub.labCode}` : ""}
            </p>
          </div>
          <StatusBadge status={sample.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoGitBranchOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("parent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={parentHref} className="text-lg font-semibold text-primary hover:underline">
              {sample.sampleCode}
            </Link>
            <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {parent.sampleIdent ?? parent.labCode}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoLayersOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">{tSamples("currentStage")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {sample.currentStage
                ? stageLabel(tStages, sample.currentStage.key, sample.currentStage.name)
                : tSamples("notStarted")}
            </p>
            <p className="text-xs text-muted-foreground">{t("stageFollows")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <IoCalendarOutline className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("created")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {format.dateTime(sub.createdAt, { dateStyle: "long", timeStyle: "short" })}
            </p>
          </CardContent>
        </Card>
      </div>

      <LabRecordPanel
        record={toLabRecordDTO(sub)}
        audits={audits}
        showHistory={canSeeHistory}
        lastEditedBy={sub.updatedBy?.name ?? null}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("others")}</CardTitle>
        </CardHeader>
        <CardContent>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {others.map((other) => (
                <li key={other.id}>
                  <Link
                    href={subSamplePath(sample.sampleCode, other.subCode ?? "")}
                    className="inline-flex rounded-full border px-3 py-1 text-sm hover:bg-muted"
                  >
                    {t("title", { code: other.subCode ?? "" })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
