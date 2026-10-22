import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { createDataSourceSchema, listDataSourceQuerySchema } from "@/modules/eksplorasi/validation";
import { createDataSource, listDataSource } from "@/modules/eksplorasi/lib/data-source-service";

/** One list's rows (the data source, or one QC type), newest first, searched and filtered. */
export const GET = route({ capability: "manageExplorationData", query: listDataSourceQuerySchema }, async ({ query }) =>
  jsonSuccess(await listDataSource(query))
);

/** A new row. A sample ID already in use is refused with 409. */
export const POST = route({ capability: "manageExplorationData", body: createDataSourceSchema }, async ({ body, session }) =>
  jsonSuccess(await createDataSource(body, session.userId), 201)
);
