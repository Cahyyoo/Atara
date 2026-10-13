import type { IconType } from "react-icons";
import { IoChevronForward } from "react-icons/io5";

/** One row of the launcher's quick-access list, whether a link or a button. */
export const quickRowClass =
  "group/row flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

export function QuickRowBody({ icon: Icon, title, hint }: { icon: IconType; title: string; hint: string }) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/row:bg-primary/10 group-hover/row:text-primary">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <IoChevronForward aria-hidden className="size-4 shrink-0 text-muted-foreground/60" />
    </>
  );
}
