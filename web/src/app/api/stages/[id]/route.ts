import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateStages } from "@/lib/stages-cache";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { updateStageSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireCapability(request, "manageDashboard");

    const { id } = await params;
    const body = updateStageSchema.parse(await readJsonBody(request));

    const stage = await prisma.stage.findUnique({ where: { id }, select: { id: true } });
    if (!stage) {
      throw new ApiError("Stage not found.", 404);
    }

    const updated = await prisma.stage.update({
      where: { id },
      data: {
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });

    invalidateStages();
    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
