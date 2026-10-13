/**
 * The notice queue behind the toaster.
 *
 * Kept out of the component so the rules can be tested against a clock rather
 * than against a screen: what enters, what leaves, and what happens when more
 * arrive than anyone could read.
 */

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** When it should leave, in ms on the same clock `now` is measured on. */
  expiresAt: number;
}

export type ToastTone = "success" | "error";

/**
 * How long a notice stays, by what it has to say.
 *
 * "Saved" needs a glance; "that face did not match" needs reading, and reading
 * it is what tells someone whether to try again or fetch an admin. Derived
 * from the tone rather than passed in, so no caller can forget to ask for the
 * longer one.
 */
export const TOAST_MS: Record<ToastTone, number> = {
  success: 4000,
  error: 6000,
};

/**
 * Most that may be on screen at once.
 *
 * A stack with no ceiling covers the page it is reporting on, and the notices
 * underneath are the ones nobody reads anyway. Oldest goes first, because the
 * newest is the one describing what just happened.
 */
export const MAX_TOASTS = 3;

let nextId = 1;

export function createToast(message: string, tone: ToastTone, now: number): Toast {
  return { id: nextId++, message, tone, expiresAt: now + TOAST_MS[tone] };
}

/**
 * Add a notice, unless the same one is already the newest on screen.
 *
 * The face step can refuse the same way twice in a row -- it captures by
 * itself now, so "no blink seen" is a thing that happens on a timer rather
 * than on a press -- and two identical red boxes stacked up do not carry twice
 * the information. They carry the same sentence, already read, over twice as
 * much of the screen.
 *
 * A repeat refreshes the one that is there instead, so it stays long enough to
 * be read again rather than being replaced by its own twin. Only against the
 * newest: two different notices with an older one repeating is a sequence
 * worth seeing in order.
 */
export function addToast(current: Toast[], toast: Toast): Toast[] {
  const newest = current[current.length - 1];
  if (newest && newest.message === toast.message && newest.tone === toast.tone) {
    return [...current.slice(0, -1), { ...newest, expiresAt: toast.expiresAt }];
  }
  return [...current, toast].slice(-MAX_TOASTS);
}

export function dismissToast(current: Toast[], id: number): Toast[] {
  return current.filter((toast) => toast.id !== id);
}

/** Those still worth showing at `now`. */
export function activeToasts(current: Toast[], now: number): Toast[] {
  return current.filter((toast) => toast.expiresAt > now);
}

/**
 * When to look again, in ms from `now`, or null if nothing will change on its
 * own. One timer set to the soonest expiry, rather than a timer per notice or
 * a loop that wakes up to find nothing to do.
 */
export function nextSweepIn(current: Toast[], now: number): number | null {
  if (current.length === 0) return null;
  const soonest = Math.min(...current.map((toast) => toast.expiresAt));
  return Math.max(0, soonest - now);
}

/** Test seam: ids are a module counter, and a test should not depend on the last run. */
export function resetToastIds(): void {
  nextId = 1;
}
