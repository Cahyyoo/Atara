import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/core/lib/http/api-response";
import { requireCapability } from "@/core/lib/http/api-auth";
import { readJsonBody, BODY_LIMIT } from "@/core/lib/http/api-request";
import { burstSchema } from "@/core/lib/face/face-burst";
import {
  analyseFrames,
  FaceServiceBusyError,
  FaceServiceUnavailableError,
} from "@/core/lib/face/face-service";
import { judgeBurst } from "@/core/lib/face/face-reading";
import { readingRefused, serviceBusy, serviceDown, videoDimensions } from "@/core/lib/face/face-route";

/**
 * One reading, for enrolment.
 *
 * Enrolling takes five readings across five poses, judged against each other
 * as they arrive so that somebody walking through the third shot is refused
 * on the spot rather than stored. That comparison needs the descriptors in
 * hand between presses, so this route hands one back.
 *
 * That is safe here and would not be on the sign-in route, and the difference
 * is who is asking. The caller is an administrator with a session, and an
 * administrator can already write descriptors straight into an account
 * through POST /api/users/[id]/face -- so seeing one grants nothing they do
 * not have. At sign-in the caller is the person being checked, and a
 * descriptor in their hands is a credential they could replay without a
 * camera. Same bytes, different trust boundary.
 */
export async function POST(request: NextRequest) {
  try {
    await requireCapability(request, "manageUsers");
    const body = burstSchema.parse(await readJsonBody(request, BODY_LIMIT.burst));

    const reading = judgeBurst(await analyseFrames(body.frames), videoDimensions(body));
    if (!reading.ok) {
      return readingRefused(reading);
    }

    return jsonSuccess({
      descriptor: reading.descriptor,
      alive: reading.alive,
      diagnostics: reading.diagnostics,
    });
  } catch (error) {
    if (error instanceof FaceServiceBusyError) {
      return serviceBusy();
    }
    if (error instanceof FaceServiceUnavailableError) {
      return serviceDown();
    }
    return handleApiError(error);
  }
}
