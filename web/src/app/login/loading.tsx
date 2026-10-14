import { Card, CardContent } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";

/**
 * Reached by a client navigation more often than it looks: logging out pushes
 * here, and without a boundary that push leaves the preparator staring at the
 * page they just left. The page's own shape: the brand half from lg up, the
 * form on the other.
 */
export default function LoginLoading() {
  return (
    <div className="grid h-dvh overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div aria-hidden className="surface-hero hidden lg:block" />

      <div className="flex min-h-0 flex-col items-center justify-center gap-4 bg-muted/40 px-4 py-4 lg:bg-background">
        <div className="flex items-center gap-3 lg:hidden">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="hidden h-8 w-64 lg:block" />

        <Card className="w-full max-w-sm [--card-spacing:--spacing(5)] lg:bg-transparent lg:shadow-none lg:[--card-spacing:--spacing(0)]">
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="mx-auto h-4 w-56 max-w-full" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="mt-1 h-10 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
