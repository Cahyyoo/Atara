import { Card, CardContent } from "@/core/components/ui/card";
import { Skeleton } from "@/core/components/ui/skeleton";

/** The brand, then a card of three password fields and two buttons. */
export default function ChangePasswordLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted/40 px-4 py-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-2xl" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Card className="w-full max-w-sm [--card-spacing:--spacing(5)]">
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
