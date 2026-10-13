import { Skeleton } from "@/core/components/ui/skeleton";

/** The launcher's shape: the greeting, the cards, and the quick-access panel beside them. */
export default function HomeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pt-2 sm:pt-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, card) => (
              <Skeleton key={card} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-72 w-full rounded-2xl lg:mt-8" />
      </div>
    </div>
  );
}
