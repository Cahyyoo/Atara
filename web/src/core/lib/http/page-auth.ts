import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionFromCookies, type SessionPayload } from "@/core/lib/auth/auth";
import { loadSession } from "@/core/lib/auth/session-user";
import { can, type Capability } from "@/core/lib/auth/permissions";
import { SIGN_IN_REASON } from "@/core/lib/auth/session-codes";
import { HOME_PATH } from "@/core/lib/app/home-path";

/**
 * The cookie's session for server components, with where it stands.
 *
 * Memoised per request: the app layout, a route guard and the page itself all
 * call this, and each call used to verify the JWT and hit the database again.
 */
const readPageSession = cache(
  async (): Promise<{
    session: SessionPayload | null;
    signInReason: string | null;
    mustChangePassword: boolean;
  }> => {
    const session = await getSessionFromCookies();
    if (!session) return { session: null, signInReason: null, mustChangePassword: false };

    const state = await loadSession(session.sessionId, session.userId);
    if (state?.status === "active") {
      return {
        session: { ...session, role: state.role, department: state.department },
        signInReason: null,
        mustChangePassword: state.mustChangePassword,
      };
    }
    if (state?.status === "replaced") {
      return { session: null, signInReason: SIGN_IN_REASON.replaced, mustChangePassword: false };
    }
    if (state?.status === "ended") {
      return { session: null, signInReason: SIGN_IN_REASON[state.reason], mustChangePassword: false };
    }
    return { session: null, signInReason: null, mustChangePassword: false };
  }
);

/** Whether the signed-in person has to replace the password an administrator chose. */
export async function mustChangePassword(): Promise<boolean> {
  return (await readPageSession()).mustChangePassword;
}

/**
 * Session for server components, with the role re-read from the database so a
 * promotion, demotion, deactivation or sign-in elsewhere applies without
 * waiting for a new login.
 */
export async function getActiveSession(): Promise<SessionPayload | null> {
  return (await readPageSession()).session;
}

/**
 * Where to send somebody with no usable session: to the sign-in page, saying
 * why when it was not their own doing (another device took over, an
 * administrator ended it, the password was changed).
 */
export async function signInPath(): Promise<string> {
  const { signInReason } = await readPageSession();
  return signInReason ? `/login?reason=${signInReason}` : "/login";
}

/**
 * Guards a page by capability (see permissions.ts). Redirects rather than
 * throwing: somebody who follows a link to a page their role or department
 * does not have lands on the portal, which everybody can see.
 */
export async function requireCapabilityPage(capability: Capability): Promise<SessionPayload> {
  const session = await getActiveSession();
  if (!session) {
    redirect(await signInPath());
  }
  if (await mustChangePassword()) {
    redirect("/change-password");
  }
  if (!can(session, capability)) {
    redirect(HOME_PATH);
  }
  return session;
}

/** Guards a page that only needs a usable session, such as the portal. */
export async function requireSessionPage(): Promise<SessionPayload> {
  const session = await getActiveSession();
  if (!session) {
    redirect(await signInPath());
  }
  if (await mustChangePassword()) {
    redirect("/change-password");
  }
  return session;
}
