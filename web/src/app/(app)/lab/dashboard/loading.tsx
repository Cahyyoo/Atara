import { Card, CardContent, CardHeader } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";
import { PageHeadingSkeleton, TableCardSkeleton } from "@/core/components/layout/page-skeleton";

/**
 * The heaviest page in the app: six KPI tiles, five charts and a table, behind
 * buildAnalytics() and its fourteen queries. Exactly the one that must not
 * leave the screen unchanged while it thinks.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />

      {/* Same grid as kpi-cards.tsx, so the tiles do not reflow on arrival. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, tile) => (
          <Card key={tile} className="h-full">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-9 rounded-xl" />
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* One wide chart, then two columns of two — the shape in dashboard-charts.tsx. */}
      <Card>
        <CardHeader className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full rounded-lg" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[260, 260, 240, 240].map((height, chart) => (
          <Card key={chart}>
            <CardHeader className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3.5 w-56 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="w-full rounded-lg" style={{ height }} />
            </CardContent>
          </Card>
        ))}
      </div>

      <TableCardSkeleton rows={5} columns={6} />
    </div>
  );
}
