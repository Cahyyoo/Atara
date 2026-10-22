import { route } from "@/core/lib/http/api-route";
import { exportResponse } from "@/core/lib/sheets/export-response";
import { viewColumns, viewOf, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";

/**
 * An empty sheet for one list (`view`): the headers its importer reads, on
 * row 1, and nothing else -- an example row would be one more thing to
 * remember to delete before importing, and forgetting would create a sample.
 */
export const GET = route({ capability: "manageExplorationData" }, async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const view = viewOf(params.get("view"));
  return exportResponse({
    format: params.get("format") === "csv" ? "csv" : "xlsx",
    sheetName: VIEWS[view].sheetName,
    baseFilename: `${VIEWS[view].fileName}-template`,
    columns: viewColumns(view),
    rows: async function* () {},
    plain: true,
  });
});
