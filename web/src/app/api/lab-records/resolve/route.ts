import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { resolveLabRecordsSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { resolvePastedKeys } from "@/lib/sub-records";

/**
 * What the Sample IDs of a pasted sheet name, across every live record -- so
 * results can be pasted without ticking their rows first. The sack count may
 * be left out. Each key comes back found, a new sub-sample of a record that
 * exists, ambiguous, or unknown; nothing is written.
 */
export async function POST(request: NextRequest) {
  try {
    await requireCapability(request, "enterResults");
    const body = resolveLabRecordsSchema.parse(await readJsonBody(request));
    return jsonSuccess({ results: await resolvePastedKeys(body.keys) });
  } catch (error) {
    return handleApiError(error);
  }
}
