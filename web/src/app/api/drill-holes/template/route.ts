import { NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { exportResponse } from "@/lib/export-response";
import { DRILL_HOLE_COLUMNS } from "@/lib/drill-hole-columns";

/**
 * An empty drilling sheet: the headers the importer reads, on row 1, and
 * nothing else -- an example row would be one more thing to remember to
 * delete before importing, and forgetting would create a hole.
 */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageDrilling");
    const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";

    return exportResponse({
      format,
      sheetName: "Drill Holes",
      baseFilename: "drill-holes-template",
      columns: DRILL_HOLE_COLUMNS,
      rows: async function* () {},
      plain: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
