import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";

/**
 * "Is this still my session?" -- asked every few seconds by the browser and
 * the phone, so a device another sign-in took over finds out promptly rather
 * than at its next click.
 *
 * As cheap as a request can be: the token check plus one primary-key read
 * (loadSession). A replaced session answers 401 with code "session-replaced"
 * and when and where it was taken over, which is what the notice shows.
 *
 * The answer names the session the cookie now holds. Every tab of a browser
 * shares that cookie, so a tab that sees an id other than its own knows
 * another tab has signed in since -- perhaps as somebody else -- and reloads
 * rather than go on showing the old account over the new one's requests.
 */
export const GET = route({ allowPasswordChange: true }, async ({ session }) => {
  return jsonSuccess({ ok: true, sessionId: session.sessionId });
});
