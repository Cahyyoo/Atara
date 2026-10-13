"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";

/**
 * A summary that doubles as a filter: one button per value with how many rows
 * have it, pressed to narrow the list below and pressed again to let go.
 *
 * Counted across everything the other filters match rather than across one
 * page, and deliberately not narrowed by its own filter: picking one narrows
 * the list, and if the chips narrowed too they would collapse to a single
 * figure and take away the comparison that made somebody click.
 */
export function FilterChips({
  title,
  hint,
  emptyText,
  items,
  picked,
  onPick,
  tourId,
}: {
  title: string;
  hint: string;
  emptyText: string;
  items: { key: string; label: string; total: number }[];
  picked: string;
  onPick: (key: string | null) => void;
  /** Marks the card for a guided tour (`data-tour`). */
  tourId?: string;
}) {
  return (
    <Card data-tour={tourId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => {
              const isPicked = item.key === picked;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-pressed={isPicked}
                    onClick={() => onPick(isPicked ? null : item.key)}
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                      isPicked ? "bg-primary text-primary-foreground" : "bg-muted/60 hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="tabular-nums opacity-80">{item.total}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
