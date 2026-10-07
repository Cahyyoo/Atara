"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this person asked their system for less movement.
 *
 * The rest of the app already answers that question twice: globals.css has a
 * prefers-reduced-motion block, and MotionProvider passes reducedMotion="user"
 * to the animation library. Neither reaches a chart. Chart.js draws into a
 * canvas, and a canvas is a picture as far as CSS is concerned -- a media
 * query cannot shorten something a script is painting frame by frame.
 *
 * So the charts have to ask for themselves, or they would be the one thing in
 * the app that carries on moving after somebody has said they would rather it
 * did not.
 *
 * useSyncExternalStore rather than state mirrored in an effect. The preference
 * is not this component's to own -- it belongs to the browser, it can change
 * while the tab is open, and it does not exist at all on the server. That is
 * the shape this hook is for, and it is also why the first attempt failed
 * lint: copying an external value into state inside an effect is the thing it
 * replaces.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {};

  const query = matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof matchMedia !== "function") return false;
  return matchMedia(QUERY).matches;
}

/**
 * There is no such preference on a server, and guessing would mean the first
 * paint disagreed with hydration.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
