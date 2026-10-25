import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { readJsonBody } from "@/core/lib/http/api-request";
import { crmRowSchema } from "@/modules/eksplorasi/validation";
import { createCrm, crmKindOf, listCrm } from "@/modules/eksplorasi/lib/crm-list-service";

type Params = { kind: string };

/** Every row of one CRM table, in the lab's order. */
export const GET = route<Params>({ capability: "manageExplorationData" }, async ({ params }) =>
  jsonSuccess(await listCrm(crmKindOf(params.kind)))
);

/** A new row. A name already in the table is refused with 409. */
export const POST = route<Params>({ capability: "manageExplorationData" }, async ({ params, request, session }) => {
  const kind = crmKindOf(params.kind);
  // Parsed here rather than by route(): which columns a row has depends on the table.
  const body = crmRowSchema(kind).parse(await readJsonBody(request));
  return jsonSuccess(await createCrm(kind, body, session.userId), 201);
});
