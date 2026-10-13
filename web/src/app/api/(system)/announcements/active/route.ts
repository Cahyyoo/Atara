import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { loadActiveAnnouncements } from "@/modules/system/lib/announcements";

/**
 * The banner as this account should see it now: live announcements aimed at
 * their role, warnings first.
 *
 * Separate from the administrator's list next door, which is every
 * announcement ever written and is theirs to manage. This one is for reading,
 * so every signed-in account may call it -- the website renders the same thing
 * in its layout, and the phone has no layout to render it from.
 */
export const GET = route({}, async ({ session }) => {
  return jsonSuccess({ announcements: await loadActiveAnnouncements(session.role) });
});
