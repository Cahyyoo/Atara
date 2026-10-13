import { Card, CardContent, CardHeader } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";
import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";

/** One card holding the identity blocks and the generate controls. */
export default function GenerateLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <Skeleton className="h-9 w-20 rounded-xl" />
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>
            <Skeleton className="h-9 w-56 max-w-full rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
