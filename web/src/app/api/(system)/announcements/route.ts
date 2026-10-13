import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { announcementSchema } from "@/modules/system/validation";
import { readJsonBody } from "@/core/lib/http/api-request";
import { invalidateAnnouncements, toAnnouncementDTO } from "@/modules/system/lib/announcements";

/** Every announcement, newest first: live, scheduled and ended. */
export const GET = route({ capability: "manageAnnouncements" }, async () => {
  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
    take: 100,
  });
  return jsonSuccess({ announcements: rows.map(toAnnouncementDTO) });
});

/** A new banner. It shows from its start until its end, or until ended by hand. */
export const POST = route({ capability: "manageAnnouncements" }, async ({ request, session }) => {
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
});
