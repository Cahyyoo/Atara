import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { descriptorToBytes, isDescriptorPayload } from "@/lib/face-match";
import { readJsonBody } from "@/lib/api-request";

/** Enough frames to cover a change of light; few enough that enrolling is quick. */
const REQUIRED_FRAMES = 5;

const enrollSchema = z.object({
  /**
   * Explicit and separate, not a checkbox folded into something else. UU PDP
   * No. 27/2022 treats biometrics as specific personal data, and the consent
   * it asks for is the kind a person gives knowingly for this one purpose.
   */
  consent: z.literal(true, {
    message: "Consent is required before a face can be enrolled.",
  }),
  descriptors: z.array(z.array(z.number())),
});

/** Enrol, replacing whatever was there. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireCapability(request, "manageUsers");
    const { id } = await context.params;
    const body = enrollSchema.parse(await readJsonBody(request));

    if (body.descriptors.length !== REQUIRED_FRAMES) {
      throw new ApiError(`Enrolment needs exactly ${REQUIRED_FRAMES} readings.`, 400);
    }
    if (!body.descriptors.every(isDescriptorPayload)) {
      throw new ApiError("One of the face readings was not usable. Please try again.", 400);
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) {
      throw new ApiError("User not found.", 404);
    }

    // Replace rather than append: re-enrolling exists because the old
    // readings stopped working, and keeping them would keep letting the old
    // ones decide the match.
    await prisma.$transaction([
      prisma.faceEnrollment.deleteMany({ where: { userId: id } }),
      prisma.faceEnrollment.createMany({
        data: body.descriptors.map((descriptor) => ({
          userId: id,
          descriptor: descriptorToBytes(Float32Array.from(descriptor)),
          createdById: admin.userId,
        })),
      }),
      prisma.user.update({
        where: { id },
        data: { faceConsentAt: new Date(), faceConsentById: admin.userId },
      }),
    ]);

    return jsonSuccess({ enrolled: REQUIRED_FRAMES });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Remove someone's face data.
 *
 * A real delete, not a flag. This is the erasure route for specific personal
 * data, and it is also the way an operator who cannot get past the camera --
 * a dust mask, safety glasses, a bad light over the bench -- is let back in.
 * There is deliberately no self-service version of this: any automatic way
 * around a second factor becomes its weakest point.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireCapability(request, "manageUsers");
    const { id } = await context.params;

    const removed = await prisma.$transaction([
      prisma.faceEnrollment.deleteMany({ where: { userId: id } }),
      prisma.user.update({
        where: { id },
        data: { faceConsentAt: null, faceConsentById: null },
      }),
    ]);

    return jsonSuccess({ removed: removed[0].count });
  } catch (error) {
    return handleApiError(error);
  }
}
