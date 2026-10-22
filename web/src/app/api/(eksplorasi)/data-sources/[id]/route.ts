import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { updateDataSourceSchema } from "@/modules/eksplorasi/validation";
import {
  deleteDataSource,
  getDataSource,
  updateDataSource,
} from "@/modules/eksplorasi/lib/data-source-service";

type Params = { id: string };

export const GET = route<Params>({ capability: "manageExplorationData" }, async ({ params }) =>
  jsonSuccess(await getDataSource(params.id))
);

/** Changes only the fields sent. A missing row is a 404, a taken sample ID a 409. */
export const PATCH = route<Params, typeof updateDataSourceSchema>(
  { capability: "manageExplorationData", body: updateDataSourceSchema },
  async ({ params, body, session }) => jsonSuccess(await updateDataSource(params.id, body, session.userId))
);

/** Removed outright: nothing hangs off a row. */
export const DELETE = route<Params>({ capability: "manageExplorationData" }, async ({ params }) =>
  jsonSuccess(await deleteDataSource(params.id))
);
