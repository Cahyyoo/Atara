import { redirect } from "next/navigation";
import { getActiveSession, signInPath } from "@/core/lib/http/page-auth";

/**
 * The live session, not just a signature: a cookie whose session has already
 * ended used to be sent to /home only to be sent on to /login from there.
 */
export default async function Home() {
  const session = await getActiveSession();
  redirect(session ? "/home" : await signInPath());
}
