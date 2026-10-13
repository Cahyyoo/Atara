import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { generateSamplesSchema } from "@/modules/lab/validation/samples";
import { createSamplesWithLabCodes } from "@/modules/lab/lib/samples/sample-creation";
import { readJsonBody } from "@/core/lib/http/api-request";

export const POST = route({ capability: "generateSamples" }, async ({ request, session }) => {
  const body = generateSamplesSchema.parse(await readJsonBody(request));

  const samples = await createSamplesWithLabCodes({
    identities: body.identities,
    createdById: session.userId,
  });

  // The author of this change is about to look for it on the dashboard.
  invalidateAnalytics();
  return jsonSuccess(samples, 201);
});
