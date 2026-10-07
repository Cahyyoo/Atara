"use client";

import { useEffect, useRef, useState } from "react";
import { pendingWindow } from "@/lib/pending-display";

/**
 * Turns "is something in flight" into "should an indicator be on screen".
 *
 * The thresholds and their reasoning live in lib/pending-display.ts, which is
 * pure and tested. This is only the clock and the timer around it.
 *
 * Everything happens in the effect. Reading the clock or writing a ref during
 * render is impure and can be run twice or thrown away under concurrent
 * rendering, which would give an indicator a start time it never had.
 */
export function usePendingDisplay(isPending: boolean): boolean {
  const startedAt = useRef<number | null>(null);
  const settledAt = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isPending) {
      // A new request arriving while the previous indicator is still up
      // continues that wait rather than starting a fresh quiet window —
      // otherwise typing in a search box would strobe it off and on.
      if (startedAt.current === null) startedAt.current = Date.now();
      settledAt.current = null;
    } else if (startedAt.current !== null && settledAt.current === null) {
      settledAt.current = Date.now();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const state = pendingWindow(startedAt.current, Date.now(), settledAt.current);
      setVisible(state.visible);

      if (state.recheckIn !== null) {
        // One timer for the next transition, rather than polling a clock.
        timer = setTimeout(tick, state.recheckIn);
      } else if (!state.visible && settledAt.current !== null) {
        // Settled and done showing: clear, so the next wait starts its own.
        startedAt.current = null;
        settledAt.current = null;
      }
    };

    tick();
    return () => clearTimeout(timer);
  }, [isPending]);

  return visible;
}
