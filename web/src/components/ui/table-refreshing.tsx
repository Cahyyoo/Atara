"use client";

import { m } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A table that is being refreshed, without throwing away what it is showing.
 *
 * The tables used to replace every row with a single spinner the moment a
 * filter, a sort or a page changed. At the speeds measured on this database —
 * 15 to 35ms — that is not a loading state, it is a flash: readable data,
 * gone, back again. And when it is genuinely slow, it is worse still, because
 * it takes away the rows the reader could have kept reading.
 *
 * So the rows stay. They are dimmed and made unclickable, which says plainly
 * that they are a moment out of date, and a thin bar runs above the table.
 * Nothing here is a pretence: those rows were correct a moment ago, and they
 * are labelled as being from a moment ago.
 */
export function TableRefreshing({
  isRefreshing,
  children,
  className,
}: {
  isRefreshing: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {isRefreshing ? (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-primary/15"
        >
          {/* Indeterminate on purpose. A bar that fills to 90% and stops is
              the thing that makes a wait feel broken; this one only says
              work is happening, which is all that is actually known. */}
          <m.div
            className="h-full w-1/3 rounded-full bg-primary"
            animate={{ x: ["-100%", "400%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </m.div>
      ) : null}

      <div
        // aria-busy so the state is announced, not only shaded.
        aria-busy={isRefreshing || undefined}
        className={cn(
          "transition-opacity duration-200",
          isRefreshing && "pointer-events-none opacity-55"
        )}
      >
        {children}
      </div>
    </div>
  );
}
