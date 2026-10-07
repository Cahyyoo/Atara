"use client";

import { useLinkStatus } from "next/link";
import { usePendingDisplay } from "@/hooks/use-pending-display";

/**
 * A spinner on the nav item that was actually clicked.
 *
 * `useLinkStatus` is Next's own signal, scoped to the navigation in flight —
 * it is not a guess, and it is not a bar crawling to 90% and stopping. It
 * only reports what is genuinely true: this link's page has been asked for
 * and has not arrived.
 *
 * Rendered as a child of the <Link>, which is how useLinkStatus finds it.
 *
 * Behind the same threshold as everything else: below 200ms nothing appears.
 * Measured on this database the pages answer in 15-35ms, so in normal use
 * this will not show at all — it exists for the slow query, the remote
 * database and the tablet on bad wifi.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  const visible = usePendingDisplay(pending);

  if (!visible) return null;

  return (
    <span
      aria-hidden
      className="ml-auto size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60"
    />
  );
}
