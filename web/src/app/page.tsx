import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/core/lib/auth/auth";

export default async function Home() {
  const session = await getSessionFromCookies();
  redirect(session ? "/home" : "/login");
}
