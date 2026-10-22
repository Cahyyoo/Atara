import { prisma } from "@/core/lib/prisma";
import { route } from "@/core/lib/http/api-route";
import { exportResponse } from "@/core/lib/sheets/export-response";
import { assertExportSize, cursorRows } from "@/core/lib/sheets/export-guard";
import { listDataSourceQuerySchema } from "@/modules/eksplorasi/validation";
import { DATA_SOURCE_SELECT, dataSourceWhere, toDataSourceDTO } from "@/modules/eksplorasi/lib/data-source";
import { viewColumns, viewFields, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

const exportQuery = listDataSourceQuerySchema
  .pick({ view: true, search: true, campaign: true, sampleType: true })
  .extend({ format: listDataSourceQuerySchema.shape.search });

/**
 * The rows a list is showing, as .xlsx or .csv, with that list's columns.
 *
 * Plain on purpose: headers on row 1, the same columns the list's importer
 * reads, codes rather than translated words for the sample type and
 * YYYY-MM-DD for the dates -- so the file can be edited in Excel and imported
 * straight back into the same list. Both formats are streamed row by row.
 */
export const GET = route({ capability: "manageExplorationData", query: exportQuery }, async ({ query }) => {
  const where = dataSourceWhere(query);
  assertExportSize(await prisma.dataSource.count({ where }));
  const fields = viewFields(query.view);

  return exportResponse({
    format: query.format === "csv" ? "csv" : "xlsx",
    sheetName: VIEWS[query.view].sheetName,
    baseFilename: VIEWS[query.view].fileName,
    columns: viewColumns(query.view),
    plain: true,
    rows: () =>
      cursorRows(
        // By sample ID, which is unique, so it doubles as the cursor.
        (cursor) =>
          prisma.dataSource.findMany({
            where,
            select: DATA_SOURCE_SELECT,
            orderBy: { sampleId: "asc" },
            take: PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { sampleId: cursor } } : {}),
          }),
        (row) => row.sampleId,
        (row) => {
          const sample = toDataSourceDTO(row);
          return Object.fromEntries(fields.map((field) => [field, sample[field]]));
        },
        PAGE_SIZE
      ),
  });
});
