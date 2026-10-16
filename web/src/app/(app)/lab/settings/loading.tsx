import { Card, CardContent, CardHeader } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";
import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";

/** One card of switches. */
export default function LabSettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <Card>
        <CardHeader className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-3.5 w-full" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </CardContent>
      </Card>
    </div>
  );
}
