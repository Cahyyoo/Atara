"use client";

import { m } from "motion/react";
import { cn } from "@/lib/utils";
import { rowDelay } from "@/lib/row-stagger";

/**
 * A table row that fades in where it lands.
 *
 * Deliberately not a layout animation. Every sort, filter and page in this app
 * goes through the URL and refetches from the server, so the rows that come
 * back are different rows, not the same ones in a new order — there is nothing
 * to slide. What actually happens is a replacement, and a replacement reads as
 * a fade.
 *
 * It also does not translate. A `<tr>` is `display: table-row`, which browsers
 * do not treat as a transform container the way they do a block; shifting rows
 * vertically inside a table is where table animations go wrong. Opacity is safe
 * in every engine, and on a dense table it is also the right amount.
 */
export function AnimatedTableRow({
  index,
  className,
  children,
  ...props
}: React.ComponentProps<typeof m.tr> & { index: number }) {
  return (
    <m.tr
      data-slot="table-row"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, delay: rowDelay(index), ease: "easeOut" }}
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-muted/40 has-aria-expanded:bg-muted/40 data-[state=selected]:bg-primary/8",
        className
      )}
      {...props}
    >
      {children}
    </m.tr>
  );
}
