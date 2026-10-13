"use client";

import { useEffect, useState } from "react";
import { cn } from "@/core/lib/utils";
import { HELP_SECTIONS, type HelpSectionKey } from "@/core/lib/app/help-sections";

const ICONS = Object.fromEntries(HELP_SECTIONS.map((section) => [section.key, section.icon]));

/**
 * The guide's contents beside it on wide screens, with the section being
 * read marked as you scroll. Icons are looked up here rather than passed in:
 * a component cannot cross from the server page as a prop.
 */
export function HelpToc({
  label,
  sections,
}: {
  label: string;
  sections: { key: HelpSectionKey; title: string }[];
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        // The highest section still on screen is the one being read.
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActive(top[0]);
      },
      { rootMargin: "-80px 0px -55% 0px" }
    );
    for (const section of sections) {
      const element = document.getElementById(section.key);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={label} className="sticky top-20 hidden self-start lg:block">
      <p className="mb-2 px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="flex flex-col gap-0.5 border-l">
        {sections.map((section) => {
          const Icon = ICONS[section.key];
          const current = active === section.key;
          return (
            <li key={section.key}>
              <a
                href={`#${section.key}`}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "-ml-px flex items-center gap-2 border-l-2 px-2.5 py-1.5 text-sm transition-colors",
                  current
                    ? "border-primary bg-muted font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
                <span className="truncate">{section.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
