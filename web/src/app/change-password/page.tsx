import { redirect } from "next/navigation";
import { Card, CardContent } from "@/core/components/ui/card";
import { ForcePasswordForm } from "@/core/components/auth/force-password-form";
import { getActiveSession, mustChangePassword, signInPath } from "@/core/lib/http/page-auth";
import { APP_NAME } from "@/core/lib/app/brand";
import { BrandMark } from "@/core/components/layout/brand-mark";

export const dynamic = "force-dynamic";

/**
 * Where a person whose password an administrator chose is sent, and kept,
 * until they replace it. Outside the app's own layout, which sends such a
 * person here -- inside it, this page would send them to itself.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getActiveSession();
  if (!session) {
    redirect(await signInPath());
  }
  // Nothing to replace: on to the app.
  if (!(await mustChangePassword())) {
    redirect("/home");
  }
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted/40 px-4 py-6">
      <header className="flex items-center gap-3">
        <div className="surface-hero flex size-10 shrink-0 items-center justify-center rounded-2xl text-white">
          <BrandMark className="size-6" />
        </div>
        <div>
          <h1 className="font-heading text-lg font-semibold leading-tight tracking-tight">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground">{session.name}</p>
        </div>
      </header>
      <Card className="w-full max-w-sm [--card-spacing:--spacing(5)]">
        <CardContent>
          <ForcePasswordForm next={next ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
