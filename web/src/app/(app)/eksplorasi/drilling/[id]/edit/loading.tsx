import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";
import { Skeleton } from "@/core/components/ui/skeleton";

/** The sheet's heading, then a box where the sheet will be. */
export default function DrillSheetLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <Skeleton className="h-[calc(100dvh-22rem)] min-h-96 rounded-xl" />
    </div>
  );
}
