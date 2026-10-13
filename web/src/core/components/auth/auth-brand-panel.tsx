import type { IconType } from "react-icons";
import { APP_NAME } from "@/core/lib/app/brand";
import { IoPrismOutline } from "react-icons/io5";

export interface BrandPanelPoint {
  key: string;
  icon: IconType;
  title: string;
  body: string;
}

/**
 * The left half of the sign-in page from lg up: what Atara is, before anybody
 * has an account open. It speaks of the platform -- access by role, one set of
 * data, one account -- rather than naming its modules, so it stays true as
 * modules are added. The brand gradient the rest of the app uses for its hero
 * surfaces, with a faint grid of dots fading down it -- a surface, not a
 * picture, so it reads the same in both themes.
 *
 * Plain and synchronous: the page passes the words already translated.
 */
export function AuthBrandPanel({
  brandSubtitle,
  title,
  subtitle,
  points,
  footer,
}: {
  brandSubtitle: string;
  title: string;
  subtitle: string;
  points: readonly BrandPanelPoint[];
  footer: string;
}) {
  return (
    <aside className="surface-hero relative hidden min-h-0 overflow-hidden text-white lg:flex">
      <div
        aria-hidden
        className="pattern-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]"
      />
      <div aria-hidden className="absolute -right-32 -top-32 size-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex min-h-0 w-full flex-col justify-between gap-8 p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <IoPrismOutline aria-hidden className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-heading text-lg font-semibold tracking-tight">{APP_NAME}</span>
            <span className="block text-xs text-white/70">{brandSubtitle}</span>
          </span>
        </div>

        <div className="flex max-w-md flex-col gap-3">
          <p className="font-heading text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">{title}</p>
          <p className="text-sm text-white/80 xl:text-base">{subtitle}</p>
        </div>

        <div className="flex flex-col gap-6">
          <ul className="flex max-w-md flex-col gap-4">
            {points.map(({ key, icon: Icon, title: pointTitle, body }) => (
              <li key={key} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 leading-snug">
                  <span className="block text-sm font-medium">{pointTitle}</span>
                  <span className="block text-xs text-white/70">{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/60">{footer}</p>
        </div>
      </div>
    </aside>
  );
}
