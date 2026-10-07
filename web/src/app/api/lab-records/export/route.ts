import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listLabRecordsQuerySchema } from "@/lib/validation";
import { handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/lib/export-response";
import { ASSAY_FIELDS } from "@/lib/assay";
import { buildLabRecordWhere, labRecordInclude, toLabRecordDTO } from "@/lib/lab-record";
import { formatWitaDateTime } from "@/lib/shift-date";
import { loadStages } from "@/lib/stages-cache";
import {
  LAB_RECORD_EXPORT_COLUMNS,
  parseExportColumns,
  parseStageColumnKey,
  sheetColumnsFor,
  stageCells,
} from "@/lib/export-columns";
import { stageTimeline } from "@/lib/stage-timeline";
import type { SheetRow } from "@/lib/xlsx";

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

/** The identity columns, by the option kind each names. */
const OPTION_COLUMNS = {
  place: "placeId",
  rockType: "rockTypeId",
  nonProd: "nonProdId",
  sir: "sirId",
  pit: "pitId",
} as const;

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "exportDatabase");

    const { searchParams } = new URL(request.url);

    // Read through the list's own schema, so the export filters and orders
    // exactly like the table it was asked from -- including the deleted view,
    // which it used to ignore and export the live rows instead.
    const query = listLabRecordsQuerySchema.parse({
      deleted: searchParams.get("deleted") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      placeId: searchParams.get("placeId") ?? undefined,
      shiftDate: searchParams.get("shiftDate") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      results: searchParams.get("results") ?? undefined,
      ident: searchParams.get("ident") ?? undefined,
      subs: searchParams.get("subs") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });
    const where = buildLabRecordWhere(query);
    const orderBy: Prisma.LabRecordOrderByWithRelationInput[] =
      query.sort === "shiftDate"
        ? [{ shiftDate: query.order }, { sequence: query.order }]
        : [{ [query.sort]: query.order }, { shiftDate: "desc" }, { sequence: "desc" }];

    // The limit is on rows, and with subs a parent can bring several.
    const total =
      (await prisma.labRecord.count({ where })) +
      (query.subs ? await prisma.labRecord.count({ where: { parent: { is: where } } }) : 0);
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
      LAB_RECORD_EXPORT_COLUMNS,
      stages.map((stage) => stage.id)
    );
    if (keys.length === 0) throw new ApiError("Choose at least one column to export.", 422);
    const columns = sheetColumnsFor(keys, LAB_RECORD_EXPORT_COLUMNS, stages);
    if (query.subs) {
      // Which sample a sub-sample row was taken from; empty on the samples.
      const at = columns.findIndex((column) => column.key === "sampleCode");
      columns.splice(at === -1 ? 0 : at + 1, 0, { header: "Sub Of", key: "subOf", width: 30 });
    }

    const wantsStages = keys.some((key) => parseStageColumnKey(key) !== null);
    const wantsIdentity = keys.some((key) => key in OPTION_COLUMNS);
    // The codes, once, for every place, pit and the rest a row names.
    const codeOf = new Map(
      wantsIdentity
        ? (await prisma.masterOption.findMany({ select: { id: true, code: true } })).map((option) => [
            option.id,
            option.code,
          ])
        : []
    );
    const now = new Date();

    async function* rows(): AsyncIterable<SheetRow> {
      let cursor: string | undefined;

      for (;;) {
        const page = await prisma.labRecord.findMany({
          where,
          include: {
            ...labRecordInclude,
            sample: {
              select: {
                ...labRecordInclude.sample.select,
                logs: {
                  select: { stageId: true, scannedAt: true, operator: { select: { name: true } } },
                  orderBy: { scannedAt: "asc" as const },
                  // Only read when a stage column was asked for.
                  ...(wantsStages ? {} : { take: 0 }),
                },
              },
            },
          },
          // id breaks ties, so paging cannot skip or repeat a row when several
          // share a shift date and sequence.
          // Same direction as the last sort key, so the index serves the page.
          orderBy: [...orderBy, { id: query.sort === "shiftDate" ? query.order : "desc" }],
          take: PAGE_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (page.length === 0) return;

        for (const row of page) {
          const sample = row.sample!;
          // One container, one timeline: its sub-samples share it.
          const visits = stageTimeline(
            sample.logs.map((log) => ({ stageId: log.stageId, scannedAt: log.scannedAt, operator: log.operator.name })),
            { now, completed: sample.status === "COMPLETED" }
          );
          const stageValues = stageCells(keys, visits, formatWitaDateTime);

          // A sub-sample comes straight after the sample it was taken from.
          const entries = [
            { record: toLabRecordDTO(row), subOf: null as string | null },
            ...(query.subs
              ? row.subs.map((sub) => ({ record: toLabRecordDTO(sub), subOf: row.sampleIdent ?? row.labCode }))
              : []),
          ];
          for (const { record, subOf } of entries) {
            const cells: SheetRow = {
              labCode: record.labCode,
              sampleIdent: record.sampleIdent,
              sampleCode: sample.sampleCode,
              ...(query.subs ? { subOf } : {}),
              shiftDate: record.shiftDate,
              currentStage: sample.currentStage?.name ?? "Not Started",
              status: sample.status,
              ...Object.fromEntries(
                Object.entries(OPTION_COLUMNS).map(([key, field]) => {
                  const id = record[field];
                  return [key, id ? (codeOf.get(id) ?? id) : null];
                })
              ),
              bargingNo: record.bargingNo,
              sequenceNo: record.sequenceNo,
              sampleNo: record.sampleNo,
              sackCount: record.sackCount,
              ...stageValues,
              ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, record[field.key]])),
              measurementMethod: record.measurementMethod,
              solutionId: record.solutionId,
              // The lab's own clock rather than an ISO instant: a spreadsheet
              // shows it as a date, and it is the one form the paste reads back.
              measurementFinished: formatWitaDateTime(record.measurementFinished),
              remarks: record.remarks,
              updatedAt: record.updatedAt,
            };
            yield cells;
          }
        }

        if (page.length < PAGE_SIZE) return;
        cursor = page[page.length - 1].id;
      }
    }

    return exportResponse({
      format: searchParams.get("format"),
      sheetName: "Sample Database",
      baseFilename: "sample-database",
      columns,
      rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
