import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { readJsonBody } from "@/core/lib/http/api-request";
import { crmRowChangeSchema } from "@/modules/eksplorasi/validation";
import { crmKindOf, deleteCrm, updateCrm } from "@/modules/eksplorasi/lib/crm-list-service";

type Params = { kind: string; id: string };

/** Changes only the fields sent. A missing row is a 404, a name already taken a 409. */
export const PATCH = route<Params>({ capability: "manageExplorationData" }, async ({ params, request, session }) => {
  const kind = crmKindOf(params.kind);
  const body = crmRowChangeSchema(kind).parse(await readJsonBody(request));
  return jsonSuccess(await updateCrm(kind, params.id, body, session.userId));
});

/** Removed outright: nothing refers to a CRM row. */
export const DELETE = route<Params>({ capability: "manageExplorationData" }, async ({ params }) =>
  jsonSuccess(await deleteCrm(crmKindOf(params.kind), params.id))
);
