import { Card, CardContent, CardHeader } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";
import { PageHeadingSkeleton, TableCardSkeleton } from "@/core/components/layout/page-skeleton";

/** A summary row of people, then the trail itself: time, sample, stage, by, correction, notes. */
export default function StageActivityLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <Card>
        <CardHeader className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, chip) => (
              <Skeleton key={chip} className="h-11 w-32 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
      <TableCardSkeleton columns={6} />
    </div>
  );
}
