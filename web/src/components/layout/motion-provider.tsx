"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LazyMotion, MotionConfig, domMax, m } from "motion/react";

/**
 * Motion, loaded once and configured once.
 *
 * `LazyMotion` with `m.*` keeps the feature set out of every component that
 * animates — importing `motion.div` anywhere would pull the whole library back
 * in and make this pointless. The feature bundle is `domMax` rather than the
 * lighter `domAnimation` because layout animations live only in `domMax`; that
 * is the cost of animating things that move rather than only appear.
 *
 * `reducedMotion="user"` is half of the app's answer to prefers-reduced-motion.
 * It covers motion components and nothing else, so the CSS half in globals.css
 * has to stay -- between them they cover the popups, the transitions and the
 * spinners too.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** How far a page rises as it arrives. Small: this is a hint, not a journey. */
const RISE = 8;

/**
 * The page fading up as it arrives.
 *
 * Enter only, and that is a limitation rather than a choice. The App Router
 * unmounts the old route before it mounts the new one, so there is no moment
 * when both exist and nothing to cross-fade between; a true crossfade needs the
 * View Transitions API, not this. Keyed on the pathname so React remounts on a
 * navigation, which is what makes the animation run again at all.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0, y: RISE }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
