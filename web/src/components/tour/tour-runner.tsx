"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Access } from "@/lib/permissions";
import { holdsSection } from "@/lib/help-sections";
import {
  TOUR_PARAM,
  TOUR_STEP_PARAM,
  tourCapability,
  tourFor,
  type Tour,
  type TourStep,
} from "@/lib/tours";
import { IoClose, IoWarningOutline } from "react-icons/io5";

/** How long a step waits for its element (data still loading, a panel opening). */
export const TOUR_FIND_MS = 3_000;
const POLL_MS = 150;
/** Room around the highlighted element, and the step card's width and gap. */
const PAD = 6;
const CARD_WIDTH = 320;
const GAP = 12;

/** Marks the tour's own elements, so the pause check does not see itself. */
const TOUR_UI = "data-tour-ui";

/** The first element carrying `data-tour="target"` that is actually on screen. */
function findVisible(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const element of all) {
    if (element.getClientRects().length > 0) return element;
  }
  return null;
}

/**
 * Whether the page has a dialog, menu or listbox of its own open. Those are
 * modal: anything outside them, the tour card included, cannot be clicked, so
 * the tour steps aside until they close.
 */
function pageHasPopup(): boolean {
  return Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')
  ).some((element) => !element.closest(`[${TOUR_UI}]`));
}

/** Takes the tour out of the address bar without touching any other parameter. */
function clearTourParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete(TOUR_PARAM);
  url.searchParams.delete(TOUR_STEP_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Runs the tour named in `?tour=` on whatever page is open, for a role that
 * may use that page. Mounted once, in the app shell.
 */
export function TourRunner({ access }: { access: Access }) {
  const params = useSearchParams();
  const tour = tourFor(params.get(TOUR_PARAM));
  if (!tour || !holdsSection(access, tourCapability(tour.key))) return null;
  const start = Math.max(0, Math.min(tour.steps.length - 1, Number(params.get(TOUR_STEP_PARAM)) || 0));
  return <ActiveTour key={tour.key} tour={tour} startAt={start} />;
}

function ActiveTour({ tour, startAt }: { tour: Tour; startAt: number }) {
  const t = useTranslations("tour");
  const [index, setIndex] = useState(startAt);
  const [closed, setClosed] = useState(false);
  const [paused, setPaused] = useState(false);

  const close = useCallback(
    (finished: boolean) => {
      setClosed(true);
      clearTourParams();
      if (finished) toast(t("finished"));
    },
    [t]
  );

  // Read straight from `index`, not inside a state updater: React may run an
  // updater twice, and finishing would then say so twice.
  const next = useCallback(() => {
    if (index >= tour.steps.length - 1) close(true);
    else setIndex(index + 1);
  }, [close, index, tour.steps.length]);

  // The page's own dialogs and menus pause the tour; checked on every change
  // to the document, since they come and go without telling anyone.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPaused(pageHasPopup()));
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pageHasPopup()) close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (closed || typeof document === "undefined") return null;

  return createPortal(
    <div {...{ [TOUR_UI]: "" }} className={cn(paused && "hidden")}>
      <StepView
        key={index}
        tour={tour}
        step={tour.steps[index]}
        index={index}
        onBack={() => setIndex((current) => Math.max(0, current - 1))}
        onNext={next}
        onClose={() => close(false)}
      />
    </div>,
    document.body
  );
}

function StepView({
  tour,
  step,
  index,
  onBack,
  onNext,
  onClose,
}: {
  tour: Tour;
  step: TourStep;
  index: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("tour");
  const tSteps = useTranslations(`tours.${tour.key}.${index + 1}`);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(step.target === null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const last = index === tour.steps.length - 1;

  // Look for the element, giving a loading table or opening panel a moment.
  useEffect(() => {
    if (step.target === null) return;
    const target = step.target;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const found = findVisible(target);
      if (found) {
        clearInterval(timer);
        found.scrollIntoView?.({ block: "center", behavior: "smooth" });
        setElement(found);
      } else if (Date.now() - startedAt >= TOUR_FIND_MS) {
        clearInterval(timer);
        setMissing(true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [step.target]);

  // Follow the element as the page scrolls, resizes or reflows.
  useEffect(() => {
    if (!element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(element.getBoundingClientRect()));
    };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [element]);

  // "Click it to carry on": the person tries the real thing, and the tour follows.
  useEffect(() => {
    if (!element || !step.advanceOnClick) return;
    let timer: ReturnType<typeof setTimeout>;
    const onClick = () => {
      timer = setTimeout(onNext, 250);
    };
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("click", onClick);
      clearTimeout(timer);
    };
  }, [element, step.advanceOnClick, onNext]);

  const shown = rect !== null || missing;
  useEffect(() => {
    if (shown) nextButton.current?.focus({ preventScroll: true });
  }, [shown]);

  if (!shown) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(CARD_WIDTH, viewportWidth - 32);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + PAD + GAP;
    const placeBelow = below + 220 < viewportHeight || rect.top < 240;
    cardStyle = {
      width,
      left: Math.min(Math.max(16, rect.left), viewportWidth - width - 16),
      ...(placeBelow
        ? { top: Math.min(below, viewportHeight - 16 - 120) }
        : { bottom: Math.max(16, viewportHeight - rect.top + PAD + GAP) }),
    };
  } else {
    cardStyle = { width, left: (viewportWidth - width) / 2, top: Math.max(16, viewportHeight / 2 - 110) };
  }

  return (
    <>
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[80] rounded-xl ring-2 ring-primary transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] bg-black/50" />
      )}

      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-live="polite"
        className="fixed z-[81] flex flex-col gap-3 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl"
        style={cardStyle}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-xs font-medium text-muted-foreground">
            {t("stepOf", { step: index + 1, total: tour.steps.length })}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IoClose className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="tour-step-title" className="text-sm font-semibold">
            {tSteps("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{tSteps("body")}</p>
        </div>
        {step.savesData && rect ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200">
            <IoWarningOutline aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t("savesData")}
          </p>
        ) : null}
        {missing && step.target !== null ? (
          <p className="rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{t("notShown")}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden>
            {tour.steps.map((_, dot) => (
              <span
                key={dot}
                className={cn("size-1.5 rounded-full", dot === index ? "bg-primary" : "bg-muted-foreground/30")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button size="sm" variant="outline" onClick={onBack}>
                {t("back")}
              </Button>
            ) : null}
            <Button ref={nextButton} size="sm" onClick={onNext}>
              {last ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
