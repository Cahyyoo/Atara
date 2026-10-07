import { NextRequest } from "next/server";
import { invalidateAnalytics } from "@/lib/analytics-cache";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { generateSamplesSchema } from "@/lib/validation";
import { createSamplesWithLabCodes } from "@/lib/sample-creation";
import { readJsonBody } from "@/lib/api-request";

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability(request, "generateSamples");

    const body = generateSamplesSchema.parse(await readJsonBody(request));

    const samples = await createSamplesWithLabCodes({
      identities: body.identities,
      createdById: session.userId,
    });

    // The author of this change is about to look for it on the dashboard.
    invalidateAnalytics();
    return jsonSuccess(samples, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
