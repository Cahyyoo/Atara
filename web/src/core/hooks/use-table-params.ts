"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Keeps table filters, sorting and paging in the URL, so a filtered view is
 * shareable and survives the browser's back button.
 */
export function useTableParams() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback(
    (key: string, fallback: string) => searchParams.get(key) ?? fallback,
    [searchParams]
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      // Any change other than paging itself sends the user back to page 1.
      if (!("page" in updates)) {
        next.delete("page");
      }

      const query = next.toString();
      // history.replaceState rather than router.replace: none of these pages
      // read searchParams on the server, so a router navigation would re-run
      // the whole server render just to produce the identical payload. This
      // still updates useSearchParams, so the tables react as before.
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname, searchParams]
  );

  /** Toggles direction when the same column is clicked again. */
  const toggleSort = useCallback(
    (field: string, currentSort: string, currentOrder: string) => {
      setParams({
        sort: field,
        order: currentSort === field && currentOrder === "desc" ? "asc" : "desc",
      });
    },
    [setParams]
  );

  return { get, setParams, toggleSort };
}
