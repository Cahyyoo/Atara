import { Card, CardContent, CardHeader } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";
import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";

/** The heading, the grid of shortcut cards, then contents beside the section cards. */
export default function HelpLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, card) => (
          <Skeleton key={card} className="h-[72px] w-full rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="hidden flex-col gap-2 lg:flex">
          {Array.from({ length: 8 }, (_, row) => (
            <Skeleton key={row} className="h-7 w-44" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, card) => (
            <Card key={card}>
              <CardHeader className="flex flex-row items-start gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {Array.from({ length: 3 }, (_, step) => (
                  <div key={step} className="flex gap-3">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
