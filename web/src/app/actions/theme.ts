"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

/** Persists the reader's light-or-dark choice for a year, as the locale is. */
export async function setTheme(value: string) {
  if (!isTheme(value)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
