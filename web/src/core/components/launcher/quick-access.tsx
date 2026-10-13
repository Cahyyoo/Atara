import Link from "next/link";
import { Badge } from "@/core/components/ui/badge";
import { ChangePasswordAction } from "@/core/components/launcher/change-password-action";
import { QuickRowBody, quickRowClass } from "@/core/components/launcher/quick-row";
import { initialsOf } from "@/core/lib/ui/initials";
import { IoBookOutline, IoPlayCircleOutline } from "react-icons/io5";

export interface QuickAccessLabels {
  title: string;
  account: string;
  guide: string;
  guideHint: string;
  tour: string;
  tourHint: string;
  password: string;
  passwordHint: string;
}

/**
 * The launcher's side panel: who is signed in, and the few things anybody
 * might want before choosing an app -- the guide, a short tour of the screen,
 * a new password. Nothing here costs a query: the session already holds the
 * account, and the rest are links (the tour runs off ?tour=, in the shell).
 *
 * Plain and synchronous: the page passes the words already translated.
 */
export function QuickAccess({
  name,
  email,
  badges,
  tourHref,
  labels,
}: {
  name: string;
  email: string;
  badges: readonly { label: string; variant: "default" | "secondary" }[];
  tourHref: string;
  labels: QuickAccessLabels;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border/60">
      <section aria-label={labels.account} className="flex items-center gap-3 px-1">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {initialsOf(name)}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map(({ label, variant }) => (
              <Badge key={label} variant={variant} className="text-[10px]">
                {label}
              </Badge>
            ))}
          </span>
        </span>
      </section>

      <section aria-labelledby="quick-access-heading" className="flex flex-col gap-1 border-t border-border/60 pt-3">
        <h2
          id="quick-access-heading"
          className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {labels.title}
        </h2>
        <Link href="/help" className={quickRowClass}>
          <QuickRowBody icon={IoBookOutline} title={labels.guide} hint={labels.guideHint} />
        </Link>
        <Link href={tourHref} className={quickRowClass}>
          <QuickRowBody icon={IoPlayCircleOutline} title={labels.tour} hint={labels.tourHint} />
        </Link>
        <ChangePasswordAction title={labels.password} hint={labels.passwordHint} />
      </section>
    </div>
  );
}
