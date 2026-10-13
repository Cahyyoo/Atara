"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `ms` while the tab is visible.
 *
 * A hidden tab does not tick: nobody is looking, and a dashboard left open in
 * a background tab all shift would otherwise poll for nothing. When the tab is
 * looked at again after a full interval or more, it ticks straight away
 * rather than showing stale figures until the next one. Same shape as
 * SessionWatch's check.
 */
export function useVisibleInterval(callback: () => void, ms: number) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  });

  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.hidden) return;
      last = Date.now();
      saved.current();
    };
    const onVisible = () => {
      if (!document.hidden && Date.now() - last >= ms) tick();
    };

    const timer = setInterval(tick, ms);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
}
