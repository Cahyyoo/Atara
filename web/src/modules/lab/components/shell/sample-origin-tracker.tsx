"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { nextOrigin, writeSampleOrigin } from "@/modules/lab/lib/samples/sample-origin";

/**
 * Remembers the page the sample pages were opened from, for their "Kembali".
 *
 * The address is read at every press, not only on navigation: the lists keep
 * their filters in the URL with replaceState, which no navigation reports, and
 * the filters should come back with the list.
 */
export function SampleOriginTracker() {
  const pathname = usePathname();
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    const remember = () => {
      lastUrl.current = window.location.pathname + window.location.search;
    };
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("keydown", remember, true);
    return () => {
      document.removeEventListener("pointerdown", remember, true);
      document.removeEventListener("keydown", remember, true);
    };
  }, []);

  useEffect(() => {
    const origin = nextOrigin(lastUrl.current, pathname);
    if (origin) writeSampleOrigin(origin);
    lastUrl.current = window.location.pathname + window.location.search;
  }, [pathname]);

  return null;
}
