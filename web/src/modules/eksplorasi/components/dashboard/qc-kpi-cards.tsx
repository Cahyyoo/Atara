"use client";

import type { IconType } from "react-icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { CountUp } from "@/core/components/ui/count-up";
import { cn } from "@/core/lib/utils";
import { IoAlertCircle, IoCheckmarkCircle } from "react-icons/io5";

/** One summary card: a label, a figure, and -- for a check -- whether it passes. */
export interface QcKpi {
  label: string;
  /** Null where there is no figure at all, which is not zero. */
  value: number | null;
  format: (value: number) => string;
  icon: IconType;
  /** A check's verdict; absent for a plain count. */
  status?: "good" | "attention";
  /** What the verdict, or the figure, means -- in words, so it never rests on colour. */
  hint?: string;
}

const ACCENT = {
  good: "text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/15",
  attention: "text-destructive bg-destructive/10",
  plain: "text-primary bg-primary/10",
} as const;

/**
 * A section's summary cards, as the Lab dashboard draws its own: a figure
 * each, its icon in a chip, and under it a line saying what it means. A
 * check that fails wears the destructive colour, with an icon and its words.
 */
export function QcKpiCards({ items, label }: { items: QcKpi[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const StatusIcon = item.status === "attention" ? IoAlertCircle : IoCheckmarkCircle;
        return (
          <Card key={item.label} className="h-full gap-2">
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", ACCENT[item.status ?? "plain"])}>
                <Icon aria-hidden className="size-4.5" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                <CountUp value={item.value} format={item.format} />
              </p>
              {item.hint ? (
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1 text-xs",
                    item.status === "attention" ? "font-medium text-destructive" : "text-muted-foreground"
                  )}
                >
                  {item.status ? <StatusIcon aria-hidden className="size-3.5 shrink-0" /> : null}
                  {item.hint}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
