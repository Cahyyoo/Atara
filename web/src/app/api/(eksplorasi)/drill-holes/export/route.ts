import { prisma } from "@/core/lib/prisma";
import { route } from "@/core/lib/http/api-route";
import { exportResponse } from "@/core/lib/sheets/export-response";
import { assertExportSize, cursorRows } from "@/core/lib/sheets/export-guard";
import { listDrillHolesQuerySchema } from "@/modules/eksplorasi/validation";
import { DRILL_HOLE_SELECT, drillHoleWhere, toDrillHoleDTO } from "@/modules/eksplorasi/lib/drill-hole";
import { DRILL_HOLE_COLUMNS, DRILL_HOLE_FIELDS } from "@/modules/eksplorasi/lib/drill-hole-columns";

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

const exportQuery = listDrillHolesQuerySchema.pick({ search: true, status: true }).extend({
  format: listDrillHolesQuerySchema.shape.search,
});

/**
 * The drill holes the list is showing, as .xlsx or .csv.
 *
 * Plain on purpose: headers on row 1, the same columns the importer reads,
 * codes rather than translated words for the status and YYYY-MM-DD for the
 * dates -- so the file can be edited in Excel and imported straight back.
 * Both formats are streamed row by row.
 */
export const GET = route({ capability: "manageDrilling", query: exportQuery }, async ({ query }) => {
  const where = drillHoleWhere(query);
  assertExportSize(await prisma.drillHole.count({ where }));

  return exportResponse({
    format: query.format === "csv" ? "csv" : "xlsx",
    sheetName: "Drill Holes",
    baseFilename: "drill-holes",
    columns: DRILL_HOLE_COLUMNS,
    plain: true,
    rows: () =>
      cursorRows(
        // By hole ID, which is unique, so it doubles as the cursor.
        (cursor) =>
          prisma.drillHole.findMany({
            where,
            select: DRILL_HOLE_SELECT,
            orderBy: { holeId: "asc" },
            take: PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { holeId: cursor } } : {}),
          }),
        (row) => row.holeId,
        (row) => {
          const hole = toDrillHoleDTO(row);
          return Object.fromEntries(DRILL_HOLE_FIELDS.map((field) => [field, hole[field]]));
        },
        PAGE_SIZE
      ),
  });
});
