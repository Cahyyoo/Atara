"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/permissions";
import { tourFor, tourHref } from "@/lib/tours";
import { withBasePath } from "@/lib/base-path";

interface WelcomeStep {
  title: string;
  body: string;
}

/**
 * A few steps on what this role does here, shown once per account on the
 * first visit after this was added. Closing it any way counts as seen; the
 * full guide stays one click away under "?".
 */
export function WelcomeDialog({ role, name }: { role: Role; name: string }) {
  const t = useTranslations("help.welcome");
  const tTour = useTranslations("tour");
  const router = useRouter();
  const steps = Object.values(t.raw(`${role}.steps`) as Record<string, WelcomeStep>);
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  function finish() {
    setOpen(false);
    // Fire and forget: if it fails, the worst case is the greeting once more.
    void fetch(withBasePath("/api/auth/guide-seen"), { method: "POST" }).catch(() => undefined);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) finish();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            {index === 0 ? t("hello", { name }) : null}
            {index === 0 ? " · " : null}
            {t("counter", { step: index + 1, total: steps.length })}
          </p>
          <DialogTitle>{step.title}</DialogTitle>
          <DialogDescription>{step.body}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5" aria-hidden>
          {steps.map((_, dot) => (
            <span
              key={dot}
              className={cn("size-1.5 rounded-full", dot === index ? "bg-primary" : "bg-muted-foreground/30")}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Link
            href="/help"
            onClick={finish}
            className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground")}
          >
            {t("openGuide")}
          </Link>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="outline" onClick={() => setIndex(index - 1)}>
                {t("back")}
              </Button>
            ) : null}
            {last ? (
              <>
                <Button variant="outline" onClick={finish}>
                  {t("done")}
                </Button>
                {/* Straight into trying it: the dashboard, with its tour. */}
                <Button
                  onClick={() => {
                    finish();
                    router.push(tourHref(tourFor("dashboard")!));
                  }}
                >
                  {tTour("startTour")}
                </Button>
              </>
            ) : (
              <Button onClick={() => setIndex(index + 1)}>{t("next")}</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
