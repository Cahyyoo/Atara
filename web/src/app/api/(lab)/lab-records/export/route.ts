import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { listLabRecordsQuerySchema } from "@/modules/lab/validation/records";
import { handleApiError, ApiError, jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { labRecordExportGate } from "@/modules/lab/lib/gates";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/core/lib/sheets/export-response";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import { buildLabRecordWhere, labRecordInclude, toLabRecordDTO } from "@/modules/lab/lib/records/lab-record";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { loadStages } from "@/modules/lab/lib/stages/stages-cache";
import {
  EXPORT_STAGE_LAYOUT,
  LAB_RECORD_EXPORT_COLUMNS,
  parseExportColumns,
  parseStageColumnKey,
  sheetColumnsFor,
} from "@/modules/lab/lib/records/export-columns";
import { stageTimeline, type StageVisit } from "@/modules/lab/lib/stages/stage-timeline";
import { leadTimeHours, moistureContent, smRatio, stageMoments } from "@/modules/lab/lib/records/mc";
import { arrangeReport, batchKey, type ReportRecord, type ReportValue } from "@/modules/lab/lib/analytics/analysis-report";
import { readBrandLogo } from "@/core/lib/sheets/xlsx-brand";
import { buildAnalysisReport, type ReportBand, type ReportColumn } from "@/modules/lab/lib/analytics/analysis-report-xlsx";
import { XLSX_CONTENT_TYPE, type SheetRow } from "@/core/lib/sheets/xlsx";

/** Read a page at a time so the query never holds everything at once. */
const PAGE_SIZE = 2_000;

/** How many rows a preview shows: enough to judge the file by, not the file. */
const PREVIEW_ROWS = 50;

/** The identity columns, by the option kind each names. */
const OPTION_COLUMNS = {
  place: "placeId",
  rockType: "rockTypeId",
  nonProd: "nonProdId",
  sir: "sirId",
  pit: "pitId",
} as const;

/** A moment as the lab's wall clock, for a spreadsheet cell: Excel has no timezones. */
function witaCell(at: Date): Date {
  return new Date(at.getTime() + 8 * 60 * 60 * 1000);
}

/** Who entered each record's results: the latest change by an analyst's account. */
async function analystsOf(ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let start = 0; start < ids.length; start += 1_000) {
    const audits = await prisma.labRecordAudit.findMany({
      where: { labRecordId: { in: ids.slice(start, start + 1_000) }, changedBy: { role: "ANALISIS" } },
      orderBy: { changedAt: "desc" },
      select: { labRecordId: true, changedBy: { select: { name: true } } },
    });
    for (const audit of audits) {
      if (!names.has(audit.labRecordId)) names.set(audit.labRecordId, audit.changedBy.name);
    }
  }
  return names;
}

/**
 * The Sample Database export, as the lab's FORMULIR ANALYSIS RESULT: see
 * `analysis-report.ts` for the arrangement and `analysis-report-xlsx.ts` for
 * the form. The columns are still the reader's choice. CSV carries the same
 * columns as plain rows, in the same order, without the form around them.
 */
async function exportLabRecords(request: NextRequest) {
  try {
    // Permission is checked by GET, before a slot is taken.

    const { searchParams } = new URL(request.url);

    // Read through the list's own schema, so the export filters exactly like
    // the table it was asked from, the deleted view included.
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

    const stages = await loadStages();
    const keys = parseExportColumns(
      searchParams.get("columns"),
      LAB_RECORD_EXPORT_COLUMNS,
      stages.map((stage) => stage.id),
      EXPORT_STAGE_LAYOUT.labRecords
    );
    if (keys.length === 0) throw new ApiError("Choose at least one column to export.", 422);

    const stageName = new Map(stages.map((stage) => [stage.id, stage.name]));
    const momentIds = {
      receivedId: stages.find((stage) => stage.key === "RECEIVED")?.id,
      wetPrepId: stages.find((stage) => stage.key === "WET_PREP")?.id,
      reportId: stages.find((stage) => stage.key === "REPORT")?.id,
    };
    const wantsOperator = keys.includes("operator");
    const codeOf = new Map(
      (await prisma.masterOption.findMany({ select: { id: true, code: true } })).map((option) => [option.id, option.code])
    );
    const now = new Date();
    const format = searchParams.get("format");
    // A preview is the CSV's rows, as JSON: the same arrangement, the first few.
    const preview = format === "preview";
    const xlsx = format !== "csv" && !preview;

    // Every row first: the form groups samples by batch, whatever order they
    // were listed in, and averages each batch.
    const records: (ReportRecord & { visits: Map<string, StageVisit> })[] = [];
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
              },
            },
          },
        },
        orderBy: [{ shiftDate: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const row of page) {
        const sample = row.sample!;
        // One container, one timeline: its sub-samples share it.
        const visits = stageTimeline(
          sample.logs.map((log) => ({ stageId: log.stageId, scannedAt: log.scannedAt, operator: log.operator.name })),
          { now, completed: sample.status === "COMPLETED" }
        );
        const moments = stageMoments(sample.logs, momentIds);
        for (const record of [toLabRecordDTO(row), ...(query.subs ? row.subs.map(toLabRecordDTO) : [])]) {
          // The MC table's date is the first wet-preparation scan: the day the
          // sample was weighed, even if it was scanned there again later.
          const { receivedAt, wetPrepAt: wetAt, reportAt } = moments;
          const cells: Record<string, ReportValue> = {
            sampleIdent: record.sampleIdent ?? record.labCode,
            labCode: record.labCode,
            sampleCode: sample.sampleCode,
            shiftDate: record.shiftDate,
            leadTime: leadTimeHours(receivedAt, reportAt),
            ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, record[field.key]])),
            smRatio: smRatio(record.sio2, record.mgo),
            mc: moistureContent(record.wp, record.w0, record.wd),
            measurementMethod: record.measurementMethod,
            xrayInstrument: record.xrayInstrument,
            solutionId: record.solutionId,
            measurementFinished: formatWitaDateTime(record.measurementFinished),
            mcDate: wetAt ? (xlsx ? witaCell(wetAt) : formatWitaDateTime(wetAt)) : null,
            wp: record.wp,
            w0: record.w0,
            wd: record.wd,
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
            // A sub-sample has no stage or status of its own.
            currentStage: record.parentId ? null : (sample.currentStage?.name ?? "Not Started"),
            status: record.parentId ? null : sample.status,
            remarks: record.remarks,
            updatedAt: formatWitaDateTime(record.updatedAt),
          };
          for (const key of keys) {
            const stage = parseStageColumnKey(key);
            if (!stage) continue;
            const visit = visits.get(stage.stageId);
            cells[key] = !visit
              ? null
              : stage.part === "at"
                ? xlsx
                  ? witaCell(visit.at)
                  : formatWitaDateTime(visit.at)
                : stage.part === "duration"
                  ? visit.hours
                  : visit.by;
          }
          records.push({
            id: record.id,
            parentId: record.parentId,
            site: record.placeId ? (codeOf.get(record.placeId) ?? null) : null,
            // Decides which sheet it lands on: production, or its own code.
            nonProd: record.nonProdId ? (codeOf.get(record.nonProdId) ?? null) : null,
            group: batchKey(record),
            shiftDate: record.shiftDate,
            sampleNo: record.sampleNo,
            label: record.sampleIdent ?? record.labCode,
            cells,
            visits,
          });
        }
      }

      if (page.length < PAGE_SIZE) break;
      cursor = page[page.length - 1].id;
    }

    const sheets = arrangeReport(records);
    const sheetColumns = sheetColumnsFor(keys, LAB_RECORD_EXPORT_COLUMNS, stages);
    const filename = `formulir-analysis-result-${Date.now()}`;

    if (preview) {
      const shown: { sheet: string; record: ReportRecord }[] = [];
      for (const sheet of sheets) {
        for (const record of sheet.batches.flat()) {
          if (shown.length >= PREVIEW_ROWS) break;
          shown.push({ sheet: sheet.name, record });
        }
      }
      // Who entered the results is a query of its own: asked only for the rows shown.
      const analysts = wantsOperator ? await analystsOf(shown.map(({ record }) => record.id)) : null;
      let number = 0;
      const rows = shown.map(({ sheet, record }) => {
        const isSub = Boolean(record.parentId);
        if (!isSub) number += 1;
        const cells = Object.fromEntries(
          sheetColumns.map((column) => {
            const value =
              column.key === "rowNo"
                ? isSub
                  ? null
                  : number
                : column.key === "operator"
                  ? (analysts?.get(record.id) ?? null)
                  : (record.cells[column.key] ?? null);
            return [column.key, value instanceof Date ? formatWitaDateTime(value) : value];
          })
        );
        return { id: record.id, sheet, sub: isSub, cells };
      });
      return jsonSuccess({
        total: records.length,
        columns: sheetColumns.map(({ key, header }) => ({ key, header })),
        rows,
      });
    }

    if (wantsOperator) {
      const analysts = await analystsOf(records.map((record) => record.id));
      for (const record of records) record.cells.operator = analysts.get(record.id) ?? null;
    }

    if (!xlsx) {
      const ordered = sheets.flatMap((sheet) => sheet.batches.flat());
      return exportResponse({
        format: "csv",
        sheetName: "Formulir Analysis Result",
        baseFilename: "formulir-analysis-result",
        columns: sheetColumns,
        rows: async function* (): AsyncIterable<SheetRow> {
          let number = 0;
          for (const record of ordered) {
            const isSub = Boolean(record.parentId);
            if (!isSub) number += 1;
            yield { ...(record.cells as SheetRow), rowNo: isSub ? null : number };
          }
        },
      });
    }

    const groupOf = new Map(LAB_RECORD_EXPORT_COLUMNS.map((column) => [column.key, column.group]));
    const columns: ReportColumn[] = sheetColumns.map((column) => {
      const stage = parseStageColumnKey(column.key);
      if (stage) {
        const name = stageName.get(stage.stageId) ?? "";
        return {
          key: column.key,
          header: stage.part === "at" ? "Date / Time" : stage.part === "duration" ? "Hours" : "Operator",
          band: stage.part === "at" ? "stageAt" : "stageDetail",
          stageName: name,
          width: stage.part === "by" ? 14 : stage.part === "at" ? 15 : 11,
        };
      }
      const group = groupOf.get(column.key);
      const band: ReportBand =
        column.key === "leadTime"
          ? "lead"
          : group === "sample" || group === "results" || group === "instrument" || group === "mc"
            ? group
            : "other";
      return { key: column.key, header: column.key === "leadTime" ? "Jam" : column.header, band, width: column.width };
    });

    const logo = await readBrandLogo();
    const body = await buildAnalysisReport({ sheets, columns, logo });

    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const GET = route({ capability: "exportDatabase" }, async ({ request }) => {
  // At most two at a time: see heavy-gate.ts.
  return await labRecordExportGate.run(() => exportLabRecords(request));
});
