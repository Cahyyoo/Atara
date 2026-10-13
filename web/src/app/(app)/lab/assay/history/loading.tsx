import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";

export default function ResultsHistoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <div className="h-[28rem] animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}
