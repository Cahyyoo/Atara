import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";
import { Skeleton } from "@/core/components/ui/skeleton";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";

/** The heading, the tabs beside the Elements button, the section's heading, then its charts. */
export default function ExplorationDashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-80 max-w-full rounded-xl" />
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full max-w-2xl rounded-xl" />
      <ControlChartsSkeleton />
    </div>
  );
}
