import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What a page looks like before its server render arrives.
 *
 * Next shows this the instant a link is clicked, which is the point: the old
 * behaviour was to sit on the previous page with nothing changing until the
 * whole render came back, and a screen that does not change is what reads as
 * "stuck" regardless of how long it actually takes.
 *
 * Measured honestly: on this database every page answers in 15-35ms, so most
 * of the time this will barely be seen — and that is the correct outcome, not
 * a wasted effort. It is what stands between a slow query, a remote database
 * or a tired tablet and a frozen screen.
 *
 * The shapes match the real pages: same heading block, same card heights,
 * same column counts. A skeleton whose shape is wrong makes the page jump
 * when the content lands, and that jump is more noticeable than the wait.
 */
export function PageHeadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function TableCardSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-44" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="flex gap-4 border-b bg-muted/30 px-4 py-2.5">
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton key={column} className="h-3.5 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex gap-4 border-b px-4 py-3 last:border-0">
              {Array.from({ length: columns }, (_, column) => (
                <Skeleton
                  key={column}
                  className="h-4 flex-1"
                  style={{ maxWidth: `${[70, 88, 58, 76, 64, 92][(row + column) % 6]}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** A page that is one heading and one table, which most of them are. */
export function TablePageSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <TableCardSkeleton columns={columns} />
    </div>
  );
}
