import Link from "next/link";
import type { IconType } from "react-icons";
import { IoArrowForward } from "react-icons/io5";

/** How many of a module's pages a card links to before it says "+n". */
export const SHORTCUT_LIMIT = 6;

export interface LauncherShortcut {
  href: string;
  label: string;
  icon: IconType;
}

const shortcutClass =
  "relative z-10 flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * One module on the launcher. The whole card opens the module (its title's
 * link is stretched over it), and each page it lists is a link of its own,
 * straight there -- the "items" of a Salesforce app or the tiles of a Fiori
 * launchpad -- so nobody opens a module only to click once more. No link sits
 * inside another, so each one is a stop for Tab.
 *
 * Quiet by design: a hairline ring and a soft shadow rather than a border, a
 * tinted icon rather than a gradient, and a lift on hover that says it opens.
 * Plain and synchronous: the server renders it with words already translated.
 */
export function ModuleCard({
  href,
  icon: Icon,
  name,
  description,
  shortcutsLabel,
  shortcuts,
  moreLabel,
  index = 0,
}: {
  href: string;
  icon: IconType;
  name: string;
  description: string;
  shortcutsLabel: string;
  shortcuts: readonly LauncherShortcut[];
  /** "+n more", given the number of pages left out. */
  moreLabel: (count: number) => string;
  /** Its place in the grid, for a staggered entrance. */
  index?: number;
}) {
  const shown = shortcuts.slice(0, SHORTCUT_LIMIT);
  const hidden = shortcuts.length - shown.length;

  return (
    <article
      style={{ animationDelay: `${index * 60}ms` }}
      className="group relative flex h-full animate-in flex-col gap-4 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border/60 transition-[transform,box-shadow] duration-200 fill-mode-both fade-in-0 slide-in-from-bottom-2 hover:-translate-y-0.5 hover:shadow-raised"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-base font-semibold tracking-tight">
            <Link
              href={href}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-primary focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <IoArrowForward
          aria-hidden
          className="mt-0.5 size-5 shrink-0 -translate-x-1 text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-has-focus-visible:translate-x-0 group-has-focus-visible:opacity-100"
        />
      </div>

      {shown.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {shortcutsLabel}
          </p>
          <ul className="grid grid-cols-2 gap-x-1 gap-y-0.5">
            {shown.map(({ href: to, label, icon: ShortcutIcon }) => (
              <li key={to} className="min-w-0">
                <Link href={to} className={shortcutClass}>
                  <ShortcutIcon aria-hidden className="size-4 shrink-0 text-primary/80" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
            {hidden > 0 ? (
              <li className="min-w-0">
                <Link href={href} className={shortcutClass}>
                  <span className="truncate font-medium text-primary">{moreLabel(hidden)}</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
