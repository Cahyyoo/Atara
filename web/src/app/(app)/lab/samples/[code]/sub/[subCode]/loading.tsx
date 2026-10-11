import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A sub-sample's page: heading, its sample and when it was made, then results. */
export default function SubSampleDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, card) => (
          <Card key={card}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-5 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* The timeline: a rail with four entries hanging off it. */}
      <div className="relative flex flex-col gap-6 border-l-2 border-muted pl-6">
        {Array.from({ length: 4 }, (_, entry) => (
          <div key={entry} className="relative">
            <Skeleton className="absolute -left-[31px] size-6 rounded-full" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
