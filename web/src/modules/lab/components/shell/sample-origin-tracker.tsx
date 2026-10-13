"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { nextOrigin, writeSampleOrigin } from "@/modules/lab/lib/samples/sample-origin";
import { withoutBasePath } from "@/core/lib/http/base-path";

/**
 * Remembers the page the sample pages were opened from, for their "Kembali".
 *
 * The address is read at every press, not only on navigation: the lists keep
 * their filters in the URL with replaceState, which no navigation reports, and
 * the filters should come back with the list.
 *
 * Read as the router knows it, without the base path: the address bar says
 * "/atara/lab/assay", and handed back to the router that becomes
 * "/atara/atara/lab/assay". It also has to match usePathname(), or a move
 * between one sample's pages is mistaken for leaving them.
 */
const currentUrl = () => withoutBasePath(window.location.pathname + window.location.search);
export function SampleOriginTracker() {
  const pathname = usePathname();
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    const remember = () => {
      lastUrl.current = currentUrl();
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
    lastUrl.current = currentUrl();
  }, [pathname]);

  return null;
}
