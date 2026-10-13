import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { createDrillHoleSchema, listDrillHolesQuerySchema } from "@/modules/eksplorasi/validation";
import { createDrillHole, listDrillHoles } from "@/modules/eksplorasi/lib/drill-hole-service";

/** The drill holes, newest first, by hole ID or area and by status. */
export const GET = route({ capability: "manageDrilling", query: listDrillHolesQuerySchema }, async ({ query }) =>
  jsonSuccess(await listDrillHoles(query))
);

/** A new drill hole. A hole ID already in use is refused with 409. */
export const POST = route({ capability: "manageDrilling", body: createDrillHoleSchema }, async ({ body, session }) =>
  jsonSuccess(await createDrillHole(body, session.userId), 201)
);
