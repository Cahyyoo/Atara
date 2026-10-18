import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { drillHoleSheetSchema } from "@/modules/eksplorasi/validation";
import { applyDrillHoleSheet } from "@/modules/eksplorasi/lib/drill-hole-sheet";

/**
 * The drilling sheet: new holes and unlocked existing ones, checked
 * (`dryRun`) or saved together in one transaction.
 */
export const POST = route({ capability: "manageDrilling", body: drillHoleSheetSchema }, async ({ body, session }) =>
  jsonSuccess(await applyDrillHoleSheet(body, session.userId))
);
