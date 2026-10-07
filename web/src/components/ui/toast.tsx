"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  activeToasts,
  addToast,
  createToast,
  dismissToast,
  nextSweepIn,
  type Toast,
  type ToastTone,
} from "@/lib/toast-queue";
import { IoCheckmarkCircle, IoClose, IoWarning } from "react-icons/io5";

/**
 * Notices that say something finished.
 *
 * Deliberately CSS-animated rather than using motion, and that is measured
 * rather than stylistic: the login page is its own entry, so putting a
 * MotionProvider there ships a second copy of the library -- 147.5KB, measured
 * when the sign-in error was moved to tw-animate-css for the same reason.
 * These have to appear on login, so the same rule applies. The
 * prefers-reduced-motion block in globals.css covers them with no extra work.
 *
 * Mounted once in the root layout, which is what lets a notice survive the
 * navigation that follows it: signing in fires one and redirects immediately,
 * and the toaster does not remount, so the notice arrives on the next page
 * instead of being cut off. Nothing is delayed to make room for it.
 */

type Listener = (toasts: Toast[]) => void;

let queue: Toast[] = [];
const listeners = new Set<Listener>();

function publish() {
  for (const listener of listeners) listener(queue);
}

/**
 * Show a notice. Callable from anywhere, including outside React, so a
 * completion handler does not have to be handed a prop to speak.
 */
export function toast(message: string, tone: ToastTone = "success"): void {
  queue = addToast(queue, createToast(message, tone, Date.now()));
  publish();
}

/** Close one by hand, for anyone who has read it and wants the screen back. */
function dismiss(id: number): void {
  queue = dismissToast(queue, id);
  publish();
}

/** Drop whatever has run out of time. */
function sweep(): void {
  queue = activeToasts(queue, Date.now());
  publish();
}

/** Test seam: the queue is module state and outlives a single render. */
export function resetToasts(): void {
  queue = [];
  publish();
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (next) => setToasts(next);
    listeners.add(listener);
    listener(queue);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    // One timer for the whole queue, set to whichever notice leaves first.
    const delay = nextSweepIn(toasts, Date.now());
    if (delay === null) return;

    const timer = setTimeout(sweep, delay);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div
      // `status` and not `alert`: these report something that already
      // succeeded, so they are announced politely rather than interrupting.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            "animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-raised duration-200",
            item.tone === "error"
              ? "bg-destructive text-white"
              : "bg-card text-card-foreground"
          )}
        >
          {item.tone === "error" ? (
            <IoWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <IoCheckmarkCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          )}
          <p className="min-w-0 flex-1">{item.message}</p>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            // A notice that leaves on its own still needs a way out, for
            // anyone who reads it and wants the screen back.
            className="-m-1 shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
          >
            <IoClose className="size-4" />
            <span className="sr-only">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
