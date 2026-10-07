import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeadingSkeleton } from "@/components/layout/page-skeleton";

/** The announcement form and list, then the backup card. */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      {[260, 140].map((height) => (
        <Card key={height}>
          <CardHeader className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="w-full rounded-lg" style={{ height }} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
