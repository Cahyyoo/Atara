import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { updateDrillHoleSchema } from "@/modules/eksplorasi/validation";
import {
  deleteDrillHole,
  getDrillHole,
  updateDrillHole,
} from "@/modules/eksplorasi/lib/drill-hole-service";

type Params = { id: string };

export const GET = route<Params>({ capability: "manageDrilling" }, async ({ params }) =>
  jsonSuccess(await getDrillHole(params.id))
);

/** Changes only the fields sent. A missing hole is a 404, a taken hole ID a 409. */
export const PATCH = route<Params, typeof updateDrillHoleSchema>(
  { capability: "manageDrilling", body: updateDrillHoleSchema },
  async ({ params, body, session }) => jsonSuccess(await updateDrillHole(params.id, body, session.userId))
);

/** Removed outright: drill holes have nothing hanging off them yet. */
export const DELETE = route<Params>({ capability: "manageDrilling" }, async ({ params }) =>
  jsonSuccess(await deleteDrillHole(params.id))
);
