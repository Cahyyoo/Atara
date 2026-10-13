"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { FaceCamera, type CaptureOutcome } from "@/core/components/face/face-camera";
import { toast } from "@/core/components/ui/toast";
import { formatDiagnostics } from "@/core/lib/face/face-diagnostics";
import { captureBurst, interpretRefusal } from "@/core/lib/face/face-client";
import { assessReading } from "@/modules/system/lib/face-enrollment";
import { poseHintKey } from "@/modules/system/lib/face-poses";
import { IoCheckmarkCircle } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/** Matches REQUIRED_FRAMES on the route; the server refuses any other count. */
const REQUIRED_FRAMES = 5;

interface EnrollTarget {
  id: string;
  name: string;
}

/**
 * Enrolling somebody's face, from the Users module.
 *
 * Several readings rather than one, because a single frame only recognises
 * the light it was taken in and a lab bench is not lit like a desk.
 *
 * Consent is a gate, not a notice. It is ticked before the camera will do
 * anything, and the server refuses the enrolment without it as well -- the
 * checkbox is a courtesy to the admin, the server check is the rule. Once
 * ticked it collapses to a line: it has been read, and the five readings that
 * follow need the room more than the paragraph does.
 *
 * Nobody presses anything five times. The camera counts down and fires when
 * the framing has been good for a second and a half, which is also the cue to
 * change pose -- asking an admin to hold somebody's chin steady with one hand
 * and press a button with the other was never the right shape.
 */
export function FaceEnrollDialog({
  target,
  onClose,
  onEnrolled,
}: {
  target: EnrollTarget | null;
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const t = useTranslations("face");
  const tCommon = useTranslations("common");
  const [consent, setConsent] = useState(false);
  const [descriptors, setDescriptors] = useState<number[][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  function reset() {
    setConsent(false);
    setDescriptors([]);
  }

  async function take(video: HTMLVideoElement): Promise<CaptureOutcome> {
    if (!target) return { verdict: "halt" };

    const burst = await captureBurst(video);
    if (burst.blank) {
      // Nothing about a covered lens improves by trying again in four seconds.
      return { verdict: "halt", notice: t("cameraBlank") };
    }

    let descriptor: number[];
    try {
      const response = await fetch(withBasePath("/api/face/reading"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: burst.frames,
          videoWidth: burst.videoWidth,
          videoHeight: burst.videoHeight,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        // Same treatment as the sign-in step, so the two cannot drift into
        // reporting the same thing in different places.
        const refusal = interpretRefusal(result);
        if (refusal) {
          // To the console, for the same reason as the sign-in step: these
          // numbers describe the checker, not anything the admin can do.
          if (refusal.diagnostics) {
            console.debug("[face]", formatDiagnostics(refusal.diagnostics));
          }
          return {
            verdict: refusal.canRetry ? "retry" : "halt",
            notice: t(refusal.messageKey),
          };
        }
        toast(result.error ?? tCommon("networkError"), "error");
        return { verdict: "halt" };
      }
      descriptor = result.data.descriptor;
    } catch {
      toast(tCommon("networkError"), "error");
      return { verdict: "halt" };
    }

    /**
     * Is this reading of the same person, and does it add anything?
     *
     * Nothing used to ask. Somebody walking through the shot on the third
     * reading left the account holding two faces, and either of them would
     * sign in -- with no error and nothing to notice.
     *
     * A refused reading does not advance the dots. Five dots means five
     * readings that were kept, not five attempts.
     *
     * Both refusals are answered by moving, so both belong on the picture and
     * both are worth trying again: "turn a little further" and "that is
     * somebody else" are instructions, not dead ends.
     */
    const verdict = assessReading(
      Float32Array.from(descriptor),
      descriptors.map((reading) => Float32Array.from(reading))
    );
    if (!verdict.ok) {
      return { verdict: "retry", notice: t(verdict.reason) };
    }

    const next = [...descriptors, descriptor];
    setDescriptors(next);

    if (next.length < REQUIRED_FRAMES) {
      // The pose hint has already changed underneath; the cooldown is what
      // gives somebody time to read it.
      return { verdict: "retry" };
    }

    setIsSaving(true);
    try {
      const response = await fetch(withBasePath(`/api/users/${target.id}/face`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, descriptors: next }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        toast(result.error ?? tCommon("networkError"), "error");
        // Back to the start: a half-finished set is not an enrolment, and
        // resuming from four would quietly mix two sittings.
        setDescriptors([]);
        return { verdict: "halt" };
      }

      toast(t("enrollDone", { name: target.name, count: REQUIRED_FRAMES }));
      onEnrolled();
      reset();
      onClose();
      return { verdict: "halt" };
    } catch {
      toast(tCommon("networkError"), "error");
      setDescriptors([]);
      return { verdict: "halt" };
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("enrollTitle")}</DialogTitle>
              <DialogDescription>
                {t("enrollSubtitle", { count: REQUIRED_FRAMES, name: target.name })}
              </DialogDescription>
            </DialogHeader>

            {/*
              The scrolling child the dialog asks for.

              DialogContent caps its own height and shares the shortfall out
              only to a child that says it shrinks -- without one, the box
              stopped at the cap while the content went on painting past the
              bottom of the screen, taking the Cancel button with it. That is
              what the attached screenshot showed.
            */}
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {consent ? (
                /* Read once. After that it is a line, because the camera
                   below it needs the room more than the paragraph does. */
                <button
                  type="button"
                  onClick={() => setConsent(false)}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <IoCheckmarkCircle className="size-4 shrink-0 text-primary" />
                  {t("consentGiven")}
                </button>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-3">
                  <p className="text-sm font-medium">{t("consentTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("consentBody")}</p>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    {t("consentCheck")}
                  </label>
                </div>
              )}

              {consent ? (
                <FaceCamera
                  statusLabel={
                    isSaving
                      ? t("enrollSaving")
                      : t("enrollProgress", {
                          current: Math.min(descriptors.length + 1, REQUIRED_FRAMES),
                          total: REQUIRED_FRAMES,
                        })
                  }
                  onCapture={take}
                  busy={isSaving}
                >
                  {/* What this particular reading is for. The instruction, so
                      it is the loudest thing under the picture. */}
                  <p className="text-center text-sm font-medium">
                    {t(poseHintKey(descriptors.length))}
                  </p>

                  {/* Progress as dots rather than a number alone: five readings
                      is a short queue and a queue is easier to see than count. */}
                  <div className="flex justify-center gap-1.5">
                    {Array.from({ length: REQUIRED_FRAMES }, (_, index) => (
                      <span
                        key={index}
                        className={`size-2 rounded-full transition-colors ${
                          index < descriptors.length ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                </FaceCamera>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {t("consentRequired")}
                </p>
              )}

            </div>

            {/* Outside the scroller, so it is reachable however tall the
                content gets. */}
            <Button type="button" variant="outline" disabled={isSaving} onClick={onClose}>
              {tCommon("cancel")}
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
