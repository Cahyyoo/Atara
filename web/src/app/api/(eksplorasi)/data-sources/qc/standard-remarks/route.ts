import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { qcStandardRemarkSchema } from "@/modules/eksplorasi/validation";
import { saveStandardRemark } from "@/modules/eksplorasi/lib/qc-control-service";

/** Writes the Remarks on one standard and element of the dashboard's standard table; empty removes them. */
export const PUT = route({ capability: "manageExplorationData", body: qcStandardRemarkSchema }, async ({ body, session }) =>
  jsonSuccess(await saveStandardRemark(body, session.userId))
);
