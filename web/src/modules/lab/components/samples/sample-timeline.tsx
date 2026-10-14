// Rendered only from the sample detail page, and nothing here is interactive:
// keeping it on the server keeps the whole log array out of the RSC payload.
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/core/components/ui/badge";
import type { SampleLogDTO } from "@/modules/lab/types";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { IoAlertCircleOutline, IoCheckmarkCircleOutline, IoEllipseOutline, IoPersonOutline, IoReaderOutline } from "react-icons/io5";

export async function SampleTimeline({ logs }: { logs: SampleLogDTO[] }) {
  const t = await getTranslations("samples.detail");
  const tStages = await getTranslations("stages");
  const format = await getFormatter();

  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t("timelineEmpty")}
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-6 border-l-2 border-muted pl-6">
      {logs.map((log, index) => {
        const isLast = index === logs.length - 1;
        return (
          <li key={log.id} className="relative">
            <span
              className={`absolute -left-[31px] flex size-6 items-center justify-center rounded-full ${
                isLast ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {isLast ? <IoCheckmarkCircleOutline className="size-4" /> : <IoEllipseOutline className="size-3" />}
            </span>
            <div className="flex flex-col gap-1 rounded-lg border bg-background p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  {stageLabel(tStages, log.stage.key, log.stage.name)}
                  {log.isCorrection ? (
                    <Badge variant="destructive" className="gap-1">
                      <IoAlertCircleOutline className="size-3" />
                      {t("correction")}
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{format.dateTime(new Date(log.scannedAt), { dateStyle: "long", timeStyle: "short" })}</p>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <IoPersonOutline className="size-3.5" />
                {log.preparator.name}
              </p>
              {log.notes ? (
                <p className="mt-1 flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-sm">
                  <IoReaderOutline className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {log.isCorrection ? <span className="font-medium">{t("reason")}</span> : null}
                  {log.notes}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
