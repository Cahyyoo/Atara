import { prisma } from "@/core/lib/prisma";
import { invalidateStages } from "@/modules/lab/lib/stages/stages-cache";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { updateStageSchema } from "@/modules/lab/validation/samples";
import { readJsonBody } from "@/core/lib/http/api-request";

export const PATCH = route<{ id: string }>({ capability: "manageDashboard" }, async ({ request, params }) => {
  const { id } = params;
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
});
