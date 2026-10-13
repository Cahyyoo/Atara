import { route } from "@/core/lib/http/api-route";
import { exportResponse } from "@/core/lib/sheets/export-response";
import { DRILL_HOLE_COLUMNS } from "@/modules/eksplorasi/lib/drill-hole-columns";

/**
 * An empty drilling sheet: the headers the importer reads, on row 1, and
 * nothing else -- an example row would be one more thing to remember to
 * delete before importing, and forgetting would create a hole.
 */
export const GET = route({ capability: "manageDrilling" }, async ({ request }) =>
  exportResponse({
    format: new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx",
    sheetName: "Drill Holes",
    baseFilename: "drill-holes-template",
    columns: DRILL_HOLE_COLUMNS,
    rows: async function* () {},
    plain: true,
  })
);
