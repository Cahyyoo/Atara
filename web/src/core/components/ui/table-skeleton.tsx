"use client";

import { Skeleton } from "@/core/components/ui/skeleton";
import { TableCell, TableRow } from "@/core/components/ui/table";

/**
 * Placeholder rows for a table that has nothing to show yet.
 *
 * Only for a genuine first load. Once there are rows, a refresh keeps them
 * (see TableRefreshing) — replacing real data with a placeholder is a
 * downgrade, not a loading state.
 *
 * The column count is passed in from whatever the table itself computed, never
 * copied: a skeleton with the wrong number of columns makes the page jump when
 * the data lands, and that jump is what gives the whole thing away.
 */
export function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column}>
              {/* Varied widths, because a grid of identical bars reads as a
                  pattern rather than as text that has not arrived. */}
              <Skeleton
                className="h-4"
                style={{ width: `${[68, 84, 55, 74, 62, 90][(row + column) % 6]}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
