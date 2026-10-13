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
 */
export const GET = route({ allowPasswordChange: true }, async () => {
  return jsonSuccess({ ok: true });
});
