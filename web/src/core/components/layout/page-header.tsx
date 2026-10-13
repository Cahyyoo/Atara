import type { ReactNode } from "react";

/**
 * The top of a page: its title, a line saying what it is for, and room for
 * the page's own buttons on the right.
 *
 * A server component with no state, so using it costs no JavaScript in the
 * browser -- it is the same markup every page used to write out by hand.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons beside the title, wrapping below it on a phone. */
  actions?: ReactNode;
  /** Anything under the subtitle: badges, counts. */
  children?: ReactNode;
}) {
  const heading = (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      {children}
    </div>
  );

  if (!actions) return heading;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      {heading}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
