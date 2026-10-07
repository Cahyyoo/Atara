import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";

/**
 * The welcome guide was finished or closed. Kept on the account, so it does
 * not greet the same person again on another browser or after a cleared cache.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request);
    await prisma.user.update({
      where: { id: session.userId },
      data: { guideSeenAt: new Date() },
      select: { id: true },
    });
    return jsonSuccess({ seen: true });
  } catch (error) {
    return handleApiError(error);
  }
}
