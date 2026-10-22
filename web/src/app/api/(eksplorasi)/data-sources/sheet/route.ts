import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { dataSourceSheetSchema } from "@/modules/eksplorasi/validation";
import { applyDataSourceSheet } from "@/modules/eksplorasi/lib/data-source-sheet";

/**
 * A list's sheet: new rows and unlocked existing ones, checked (`dryRun`) or
 * saved together in one transaction.
 */
export const POST = route({ capability: "manageExplorationData", body: dataSourceSheetSchema }, async ({ body, session }) =>
  jsonSuccess(await applyDataSourceSheet(body, session.userId))
);
