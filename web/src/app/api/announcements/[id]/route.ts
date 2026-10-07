import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { updateAnnouncementSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { invalidateAnnouncements, toAnnouncementDTO } from "@/lib/announcements";

async function findOrThrow(id: string) {
  const row = await prisma.announcement.findUnique({ where: { id }, select: { id: true, startsAt: true } });
  if (!row) throw new ApiError("That announcement no longer exists.", 404);
  return row;
}

/** Edit one, or `end: true` to take it down now and keep it in the list. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireCapability(request, "manageAnnouncements");
    const { id } = await params;
    const body = updateAnnouncementSchema.parse(await readJsonBody(request));
    const current = await findOrThrow(id);

    const startsAt = body.startsAt ?? current.startsAt;
    const endsAt = body.end ? new Date() : body.endsAt;
    if (!body.end && endsAt && endsAt <= startsAt) {
      throw new ApiError("The end must be after the start.", 422);
    }

    const row = await prisma.announcement.update({
      where: { id },
      data: {
        ...(body.message !== undefined ? { message: body.message } : {}),
        ...(body.tone !== undefined ? { tone: body.tone } : {}),
        ...(body.roles !== undefined
          ? { roles: body.roles && body.roles.length > 0 ? body.roles : Prisma.DbNull }
          : {}),
        ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
      },
      include: { createdBy: { select: { name: true } } },
    });

    invalidateAnnouncements();
    return jsonSuccess(toAnnouncementDTO(row));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Remove it altogether. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireCapability(request, "manageAnnouncements");
    const { id } = await params;
    await findOrThrow(id);
    await prisma.announcement.delete({ where: { id } });
    invalidateAnnouncements();
    return jsonSuccess({ deleted: id });
  } catch (error) {
    return handleApiError(error);
  }
}
