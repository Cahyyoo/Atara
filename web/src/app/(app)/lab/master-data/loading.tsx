import { Card, CardContent, CardHeader } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";
import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";

/** Five master kinds — PLACE, ROCK_TYPE, NON_PROD, PIT, SIR — two to a row. */
export default function MasterDataLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 5 }, (_, card) => (
          <Card key={card}>
            <CardHeader className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-52 max-w-full" />
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {Array.from({ length: 4 }, (_, row) => (
                <Skeleton key={row} className="h-9 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
