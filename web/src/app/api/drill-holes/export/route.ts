import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { exportResponse, EXPORT_ROW_LIMIT } from "@/lib/export-response";
import { listDrillHolesQuerySchema } from "@/lib/validation";
import { DRILL_HOLE_SELECT, drillHoleWhere, toDrillHoleDTO } from "@/lib/drill-hole";
import { DRILL_HOLE_COLUMNS } from "@/lib/drill-hole-columns";
import type { SheetRow } from "@/lib/xlsx";

/** Read a page at a time so neither the query nor the response holds everything. */
const PAGE_SIZE = 2_000;

/**
 * The drill holes the list is showing, as .xlsx or .csv.
 *
 * Plain on purpose: headers on row 1, the same columns the importer reads,
 * codes rather than translated words for the status and YYYY-MM-DD for the
 * dates -- so the file can be edited in Excel and imported straight back.
 * Both formats are streamed row by row.
 */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageDrilling");

    const { searchParams } = new URL(request.url);
    const query = listDrillHolesQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") || undefined,
    });
    const where = drillHoleWhere(query);

    // Before a single byte is written: once the stream opens, the status is
    // already sent and this can no longer be a 413.
    const total = await prisma.drillHole.count({ where });
    if (total > EXPORT_ROW_LIMIT) {
      throw new ApiError(
        `This export would contain ${total} rows. Narrow the filters to at most ${EXPORT_ROW_LIMIT}.`,
        413
      );
    }

    async function* rows(): AsyncIterable<SheetRow> {
      let cursor: string | undefined;
      for (;;) {
        // By hole ID, which is unique, so it doubles as the cursor.
        const page = await prisma.drillHole.findMany({
          where,
          select: DRILL_HOLE_SELECT,
          orderBy: { holeId: "asc" },
          take: PAGE_SIZE,
          ...(cursor ? { skip: 1, cursor: { holeId: cursor } } : {}),
        });
        for (const row of page) {
          const hole = toDrillHoleDTO(row);
          yield {
            holeId: hole.holeId,
            area: hole.area,
            status: hole.status,
            easting: hole.easting,
            northing: hole.northing,
            elevation: hole.elevation,
            azimuth: hole.azimuth,
            dip: hole.dip,
            totalDepth: hole.totalDepth,
            startDate: hole.startDate,
            endDate: hole.endDate,
            remarks: hole.remarks,
          };
        }
        if (page.length < PAGE_SIZE) return;
        cursor = page[page.length - 1].holeId;
      }
    }

    return exportResponse({
      format: searchParams.get("format") === "csv" ? "csv" : "xlsx",
      sheetName: "Drill Holes",
      baseFilename: "drill-holes",
      columns: DRILL_HOLE_COLUMNS,
      rows,
      plain: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
