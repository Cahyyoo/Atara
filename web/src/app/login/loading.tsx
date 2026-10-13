import { Card, CardContent } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";

/**
 * Reached by a client navigation more often than it looks: logging out pushes
 * here, and without a boundary that push leaves the operator staring at the
 * page they just left.
 */
export default function LoginLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-14 rounded-2xl" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>

      <Card className="w-full max-w-sm [--card-spacing:--spacing(6)]">
        <CardContent className="flex flex-col gap-5">
          <Skeleton className="mx-auto h-4 w-56 max-w-full" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="mt-1 h-10 w-full rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
