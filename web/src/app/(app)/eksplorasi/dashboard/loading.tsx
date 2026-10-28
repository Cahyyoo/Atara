import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";
import { Skeleton } from "@/core/components/ui/skeleton";

/** The heading, the filters, the two chart cards, then the control charts' heading and first row. */
export default function ExplorationDashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <Skeleton className="h-16 w-full max-w-xl rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-[26rem] rounded-xl" />
        <Skeleton className="h-[26rem] rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full max-w-2xl rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-[26rem] rounded-xl" />
        <Skeleton className="h-[26rem] rounded-xl" />
      </div>
    </div>
  );
}
