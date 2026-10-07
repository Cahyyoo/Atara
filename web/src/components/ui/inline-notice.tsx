"use client";

import { AnimatePresence, m } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The strip that says a save worked, or that it did not.
 *
 * The app already said both of these — it just said them without moving, and a
 * line of text that appears between two renders is easy to miss on a screen
 * you were not looking at. So the words are unchanged and only their arrival
 * is new.
 *
 * `AnimatePresence` is what makes it leave as well as arrive: a notice that
 * vanishes is the same problem in reverse, because you cannot tell whether it
 * went away or you imagined it.
 */
export function InlineNotice({
  children,
  tone = "success",
  className,
}: {
  children?: string | null;
  tone?: "success" | "error";
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <m.p
          // Keyed on the text, so a second save with a different message
          // replaces rather than silently rewriting the same strip.
          key={children}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          role={tone === "error" ? "alert" : "status"}
          className={cn(
            "overflow-hidden rounded-md px-3 py-2 text-sm",
            tone === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
            className
          )}
        >
          {children}
        </m.p>
      ) : null}
    </AnimatePresence>
  );
}
