import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/lib/export-response";
import { stageActivityWhere, type StageActivityFilters } from "@/lib/stage-activity";
import { formatWitaDateTime } from "@/lib/shift-date";
import type { SheetRow } from "@/lib/xlsx";

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewActivity");

    const { searchParams } = new URL(request.url);
    const corrections = searchParams.get("corrections");
    // The same filters the table applies, read the same way and handed to the
    // same builder. A download that quietly covers a different set than the
    // rows it was started from is the failure this shares code to avoid.
    const filters: StageActivityFilters = {
      search: searchParams.get("search") ?? undefined,
      operatorId: searchParams.get("operatorId") ?? undefined,
      stageId: searchParams.get("stageId") ?? undefined,
      shiftDate: searchParams.get("shiftDate") ?? undefined,
      corrections: corrections === "only" || corrections === "exclude" ? corrections : undefined,
    };
    const where = stageActivityWhere(filters);

    // Before a single byte is written: once the stream opens, the status is
    // already sent and this can no longer be a 413.
    const total = await prisma.sampleLog.count({ where });
    if (total > EXPORT_ROW_LIMIT) {
      throw new ApiError(
        `This export would contain ${total} rows. Narrow the filters to at most ${EXPORT_ROW_LIMIT}.`,
        413
      );
    }

    const columns = [
      { header: "Recorded At", key: "scannedAt", width: 22 },
      { header: "Barcode Code", key: "sampleCode", width: 18 },
      { header: "Stage", key: "stage", width: 18 },
      { header: "By", key: "operator", width: 22 },
      { header: "Correction", key: "isCorrection", width: 12 },
      { header: "Notes", key: "notes", width: 40 },
    ];

    async function* rows(): AsyncIterable<SheetRow> {
      let cursor: string | undefined;

      for (;;) {
        const page = await prisma.sampleLog.findMany({
          where,
          select: {
            id: true,
            scannedAt: true,
            isCorrection: true,
            notes: true,
            stage: { select: { name: true } },
            operator: { select: { name: true } },
            sample: { select: { sampleCode: true } },
          },
          // id breaks ties, so paging cannot skip or repeat a row when several
          // scans share a timestamp — which they do, on a bulk scan.
          orderBy: [{ scannedAt: "desc" }, { id: "desc" }],
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (page.length === 0) return;

        for (const log of page) {
          yield {
            // On the lab's clock, like every other timestamp the lab reads.
            scannedAt: formatWitaDateTime(log.scannedAt),
            sampleCode: log.sample.sampleCode,
            stage: log.stage.name,
            operator: log.operator.name,
            isCorrection: log.isCorrection ? "Yes" : "",
            notes: log.notes,
          };
        }

        if (page.length < PAGE_SIZE) return;
        cursor = page[page.length - 1].id;
      }
    }

    return exportResponse({
      format: searchParams.get("format"),
      sheetName: "Stage Activity",
      baseFilename: "stage-activity",
      columns,
      rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
