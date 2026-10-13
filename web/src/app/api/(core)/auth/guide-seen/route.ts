import { prisma } from "@/core/lib/prisma";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";

/**
 * The welcome guide was finished or closed. Kept on the account, so it does
 * not greet the same person again on another browser or after a cleared cache.
 */
export const POST = route({}, async ({ session }) => {
  await prisma.user.update({
    where: { id: session.userId },
    data: { guideSeenAt: new Date() },
    select: { id: true },
  });
  return jsonSuccess({ seen: true });
});
