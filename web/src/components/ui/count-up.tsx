"use client";

import { useRef } from "react";
import {
  animate,
  m,
  useIsomorphicLayoutEffect,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { NO_VALUE } from "@/lib/kpi-format";

interface CountUpProps {
  /** The figure to reach. `null` means there is none, which is not zero. */
  value: number | null;
  /** Applied to every intermediate frame, not only to the last one. */
  format: (value: number) => string;
  className?: string;
}

/** Long enough to read as counting, short enough not to be waited on. */
const DURATION = 0.9;

export function CountUp({ value, format, className }: CountUpProps) {
  // `reducedMotion="user"` on MotionConfig governs motion components; it does
  // not reach an `animate()` call on a bare value, so this one is asked
  // directly. Missing it would leave the one animation that changes the
  // *content* of the page running for someone who asked for stillness.
  const prefersReducedMotion = useReducedMotion();
  // Seeded with the real figure so the server renders the number, not a zero.
  const figure = useMotionValue(value ?? 0);
  const text = useTransform(figure, format);
  const hasCounted = useRef(false);

  useIsomorphicLayoutEffect(() => {
    if (value === null) return;

    if (prefersReducedMotion) {
      figure.set(value);
      return;
    }

    // First paint counts up from nothing; a later change counts on from
    // wherever the tile already was, so a refiltered dashboard does not snap
    // back to zero before moving again. Done in a layout effect so the reset
    // never reaches the screen.
    if (!hasCounted.current) {
      figure.set(0);
      hasCounted.current = true;
    }

    const controls = animate(figure, value, {
      duration: DURATION,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [value, prefersReducedMotion, figure]);

  // Absent is not a quantity, so there is nothing to count towards.
  if (value === null) {
    return <span className={className}>{NO_VALUE}</span>;
  }

  return <m.span className={className}>{text}</m.span>;
}
