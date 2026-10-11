import { Skeleton } from "@/components/ui/skeleton";
import { PageHeadingSkeleton } from "@/components/layout/page-skeleton";

/** The greeting, then a card per module. */
export default function HomeLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 1 }, (_, card) => (
          <Skeleton key={card} className="h-48 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
