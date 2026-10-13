import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { resolveLabRecordsSchema } from "@/modules/lab/validation/records";
import { readJsonBody } from "@/core/lib/http/api-request";
import { resolvePastedKeys } from "@/modules/lab/lib/records/sub-records";

/**
 * What the Sample IDs of a pasted sheet name, across every live record -- so
 * results can be pasted without ticking their rows first. The sack count may
 * be left out. Each key comes back found, a new sub-sample of a record that
 * exists, ambiguous, or unknown; nothing is written.
 */
export const POST = route({ capability: "enterResults" }, async ({ request }) => {
  const body = resolveLabRecordsSchema.parse(await readJsonBody(request));
  return jsonSuccess({ results: await resolvePastedKeys(body.keys) });
});
