import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";
import { Skeleton } from "@/core/components/ui/skeleton";
import { ControlChartsSkeleton } from "@/modules/eksplorasi/components/dashboard/qc-control-section";

/** The heading, the control charts' heading and choices, then their cards. */
export default function ExplorationDashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <Skeleton className="h-12 w-full max-w-2xl rounded-xl" />
      <ControlChartsSkeleton />
    </div>
  );
}
