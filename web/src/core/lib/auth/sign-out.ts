import { withBasePath } from "@/core/lib/http/base-path";

/**
 * Signing this tab's session out, from the browser.
 *
 * `sessionId` is the session the page was rendered for. Every tab shares the
 * cookie, so without it a tab that had fallen behind -- another tab has signed
 * in since -- would end the newer session instead of its own, and that tab
 * would land back on /login moments after signing in. The server leaves a
 * session it was not asked about alone (see the logout route).
 *
 * Never throws: signing out must always get the person to the sign-in page.
 */
export async function signOutSession(sessionId?: string): Promise<void> {
  await fetch(withBasePath("/api/auth/logout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  }).catch(() => undefined);
}
