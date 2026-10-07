"use client";

import { useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { m, useScroll, useTransform } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The fixed box a chart lives in. The chart goes in straight away.
 *
 * It used to hold each chart back until its box was scrolled to, so that the
 * three below the fold would draw themselves in where somebody could see it.
 * Measured in a real browser, what that looked like on opening the dashboard
 * was one chart growing from zero and the rest sitting as empty boxes -- or,
 * on a 768px screen, not even the first one, until the page was scrolled.
 * Opening the page read as only one chart animating.
 *
 * So every chart now mounts, and grows from zero, the moment the page has its
 * data: the five arrive together as the dashboard opens. The ones below the
 * fold have finished by the time they are scrolled to, which is the trade the
 * dashboard's own users asked for.
 *
 * The height stays on the wrapper rather than the chart, so the page does not
 * jump when the canvas arrives.
 */
export function ChartBox({
  className,
  children,
}: {
  /** The height, passed in because the five charts are not all the same size. */
  className: string;
  children: ReactNode;
}) {
  return <div className={className}>{children}</div>;
}

/**
 * Identity never rests on colour alone: every multi-series chart carries this.
 *
 * Plain DOM, outside the canvas on purpose. Chart.js draws to a bitmap that a
 * screen reader cannot enter, so the legend staying in the document is part of
 * what keeps these charts readable at all.
 */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * How far below its place a card starts, at the bottom of the window.
 *
 * The first version rose 16px over 0.4s, triggered as the card appeared, and
 * nobody saw it: the whole thing happened on the bottom row of the screen and
 * was over before the eye got there. Tied to the scroll, the movement lasts as
 * long as the scrolling does, so it has to be big enough to read over that
 * distance.
 */
const CARD_RISE = 60;

/**
 * Where the card's journey starts and ends, as useScroll offsets.
 *
 * From its top edge touching the bottom of the window to that edge reaching
 * 70% of the way down it -- about when a 332px card on a 1080px screen has its
 * bottom edge at the fold, so the card is whole just as it finishes moving.
 */
const CARD_SCROLL_RANGE: ["start end", "start 0.7"] = ["start end", "start 0.7"];

/**
 * A chart's card, arriving as it is scrolled to -- and with the scrolling.
 *
 * Its rise and fade are driven by how far it has been scrolled into view, not
 * by a timer: scroll slowly and it arrives slowly, stop and it stops, scroll
 * back up and it sinks back. That is what makes the transition something that
 * happens while scrolling rather than something that has already happened by
 * the time anybody looks.
 *
 * Reduced motion is checked here, by hand. MotionConfig reducedMotion="user"
 * (motion-provider.tsx) only reaches animations motion runs itself; a value
 * bound to the scroll through `style` is outside it and would keep moving. So
 * with reduced motion the card is simply where it belongs.
 */
export function ChartCard({
  title,
  description,
  legend,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  description?: string;
  legend?: ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  const t = useTranslations("dashboard");
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: CARD_SCROLL_RANGE });
  const y = useTransform(scrollYProgress, [0, 1], [CARD_RISE, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <m.div ref={ref} style={reducedMotion ? undefined : { y, opacity }}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
          {legend ? <div className="pt-1">{legend}</div> : null}
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <p className="flex h-56 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              {emptyMessage ?? t("chartEmpty")}
            </p>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </m.div>
  );
}
