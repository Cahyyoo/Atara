import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { announcementSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { invalidateAnnouncements, toAnnouncementDTO } from "@/lib/announcements";

/** Every announcement, newest first: live, scheduled and ended. */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageAnnouncements");
    const rows = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
      take: 100,
    });
    return jsonSuccess({ announcements: rows.map(toAnnouncementDTO) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** A new banner. It shows from its start until its end, or until ended by hand. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability(request, "manageAnnouncements");
    const body = announcementSchema.parse(await readJsonBody(request));

    const row = await prisma.announcement.create({
      data: {
        message: body.message,
        tone: body.tone,
        roles: body.roles && body.roles.length > 0 ? body.roles : Prisma.DbNull,
        ...(body.startsAt ? { startsAt: body.startsAt } : {}),
        endsAt: body.endsAt ?? null,
        createdById: session.userId,
      },
      include: { createdBy: { select: { name: true } } },
    });

    invalidateAnnouncements();
    return jsonSuccess(toAnnouncementDTO(row), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
