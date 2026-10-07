import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { ACTIVE_SAMPLE } from "@/lib/soft-delete";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/lib/export-response";
import { formatWitaDateTime } from "@/lib/shift-date";
import { loadStages } from "@/lib/stages-cache";
import {
  SAMPLE_EXPORT_COLUMNS,
  parseExportColumns,
  parseStageColumnKey,
  sheetColumnsFor,
  stageCells,
} from "@/lib/export-columns";
import { stageTimeline } from "@/lib/stage-timeline";
import type { SheetRow } from "@/lib/xlsx";

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageDashboard");

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const stageId = searchParams.get("stageId") ?? undefined;

    const where: Prisma.SampleWhereInput = { ...ACTIVE_SAMPLE };
    if (search) {
      where.sampleCode = { contains: search };
    }
    if (status === "PENDING" || status === "IN_PROGRESS" || status === "COMPLETED") {
      where.status = status;
    }
    if (stageId) {
      where.currentStageId = stageId;
    }

    // Before a single byte is written: once the stream opens, the status is
    // already sent and this can no longer be a 413.
    const total = await prisma.sample.count({ where });
    if (total > EXPORT_ROW_LIMIT) {
      throw new ApiError(
        `This export would contain ${total} rows. Narrow the filters to at most ${EXPORT_ROW_LIMIT}.`,
        413
      );
    }

    // The columns asked for; none asked for is the sheet this always gave.
    const stages = await loadStages();
    const keys = parseExportColumns(
      searchParams.get("columns"),
      SAMPLE_EXPORT_COLUMNS,
      stages.map((stage) => stage.id)
    );
    if (keys.length === 0) throw new ApiError("Choose at least one column to export.", 422);
    const columns = sheetColumnsFor(keys, SAMPLE_EXPORT_COLUMNS, stages);
    // The scan log is read only when a stage column was asked for.
    const wantsStages = keys.some((key) => parseStageColumnKey(key) !== null);
    const now = new Date();

    async function* rows(): AsyncIterable<SheetRow> {
      let cursor: string | undefined;

      for (;;) {
        const page = await prisma.sample.findMany({
          where,
          select: {
            id: true,
            sampleCode: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            currentStage: { select: { name: true } },
            labRecord: { select: { labCode: true, sampleIdent: true } },
            createdBy: { select: { name: true } },
            logs: {
              select: { stageId: true, scannedAt: true, operator: { select: { name: true } } },
              orderBy: { scannedAt: "asc" },
              // Read only when a stage column was asked for.
              ...(wantsStages ? {} : { take: 0 }),
            },
          },
          // id breaks ties, so paging cannot skip or repeat a row when several
          // share an updatedAt.
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (page.length === 0) return;

        for (const sample of page) {
          const visits = stageTimeline(
            sample.logs.map((log) => ({
              stageId: log.stageId,
              scannedAt: log.scannedAt,
              operator: log.operator.name,
            })),
            { now, completed: sample.status === "COMPLETED" }
          );
          yield {
            ...stageCells(keys, visits, formatWitaDateTime),
            sampleCode: sample.sampleCode,
            labCode: sample.labRecord?.labCode ?? null,
            sampleIdent: sample.labRecord?.sampleIdent ?? null,
            currentStage: sample.currentStage?.name ?? "Not Started",
            status: sample.status,
            createdBy: sample.createdBy.name,
            createdAt: sample.createdAt.toISOString(),
            updatedAt: sample.updatedAt.toISOString(),
          };
        }

        if (page.length < PAGE_SIZE) return;
        cursor = page[page.length - 1].id;
      }
    }

    return exportResponse({
      format: searchParams.get("format"),
      sheetName: "Nickel Samples",
      baseFilename: "nickel-sample-report",
      columns,
      rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
