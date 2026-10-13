"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import {
  BURST_FRAMES,
  BURST_INTERVAL_MS,
  closeCamera,
  grabPreviewFrame,
  InsecureContextError,
  openCamera,
} from "@/core/lib/face/face-client";
import { FaceGuide } from "@/core/components/face/face-guide";
import type { QualityReason } from "@/core/lib/face/face-quality";
import { IoCameraOutline, IoRefreshOutline, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/**
 * The camera, shared by signing in and by enrolling.
 *
 * It owns one awkward thing so the two callers do not have to: a camera keeps
 * running until it is told to stop, and a light left on beside somebody's face
 * is alarming. It stops on unmount, on error, and when the caller says it is
 * finished.
 *
 * It also fires by itself. There used to be a button -- "Verify", or "Take
 * reading 3 of 5" -- which asked somebody to hold a pose steady with one hand
 * and press with the other, and to judge for themselves whether the moment was
 * any good. The preview already knows: it measures a few times a second and says
 * whether the framing passes.
 *
 * Firing by itself needs a brake, and that is most of what is below. An
 * attempt that costs something -- a face compared and refused, which spends
 * one of five tries before the account locks -- must be asked for by a person,
 * not decided by a timer. Everything else is free to repeat, but not forever.
 */

/**
 * How often the guide asks.
 *
 * Measured at ~13ms a request server-side on a 320px frame, so the service
 * is not what sets this -- the wait is. At 500ms the count alone took a
 * second of somebody sitting still and already framed. Previews never queue
 * (see face-service.ts), so a busy service drops them rather than backing up.
 */
const PREVIEW_INTERVAL_MS = 300;

/**
 * Passing previews in a row before the capture starts.
 *
 * Three at 300ms is under a second: long enough that a face passing through
 * the frame cannot trigger it, short enough that somebody sitting still is
 * not left waiting. It doubles as the countdown, which is the part that
 * matters -- a camera that fires without warning reads as a glitch, and the
 * count is also the cue to blink.
 */
const ARM_TICKS = 3;

/**
 * Quiet time after a capture before the count can start again.
 *
 * Enrolment asks for a different pose each time, and without this the next
 * capture would begin while somebody was still reading which pose to strike --
 * and be refused as too similar to the last one, which is a confusing way to
 * be told to move.
 */
const COOLDOWN_MS = 2500;

/**
 * Quiet time after the picture first appears, before the count can start.
 *
 * Shorter than COOLDOWN_MS because there is no pose to read yet: this only
 * has to cover finding the lens. It used to borrow the full cooldown, which
 * was two and a half seconds of a working camera doing nothing -- the single
 * longest wait in a sign-in, longer than the service's whole answer.
 */
const START_DELAY_MS = 1000;

/**
 * How many free refusals in a row before it stops asking.
 *
 * Retrying costs nothing at the server for these, but it is not free here: a
 * burst is about 400KB, and somebody who cannot blink on cue would otherwise
 * be left in a loop that never ends and never says why. Three is enough to
 * ride out a bad moment and few enough to notice.
 */
const MAX_FREE_RETRIES = 3;

/**
 * How long to wait after a preview fails, and how many failures end the loop.
 *
 * The loop used to ignore every failure: a 401 once the challenge expired, a
 * 500, a proxy's HTML error page, a dropped connection -- each was skipped and
 * the next request went out half a second later, for as long as the tab was
 * open. A room of tablets doing that against a server that is already
 * struggling is the storm that keeps it struggling. Now the gap doubles and
 * is jittered by half so they fall out of step, and after five it stops.
 */
const PREVIEW_BACKOFF_MS = [500, 1000, 2000, 4000] as const;
const MAX_PREVIEW_FAILURES = 5;

/**
 * How long the frames take to gather, from the constants that gather them.
 *
 * "Blink now" is true for exactly this long. After it the burst is on its way
 * to the server and the blinking is over, so the caption has to change -- a
 * screen still asking for a blink while it waits for an answer is asking for
 * something that can no longer help.
 */
const BURST_MS = BURST_FRAMES * BURST_INTERVAL_MS;

/**
 * What a capture attempt came to.
 *
 * `retry` means nothing was spent and the camera may go again. `halt` means
 * the next attempt has to be asked for: either it costs something, or nothing
 * about it will be different in four seconds.
 *
 * `notice` is shown on the picture rather than in a corner notification,
 * because the person it is for is looking at the lens.
 */
export type CaptureOutcome =
  | { verdict: "retry"; notice?: string }
  | { verdict: "halt"; notice?: string };

export function FaceCamera({
  statusLabel,
  onCapture,
  busy = false,
  challenge,
  children,
}: {
  /** What this capture is for, shown while the camera settles. */
  statusLabel: string;
  /** Runs the reading and says whether the camera may try again by itself. */
  onCapture: (video: HTMLVideoElement) => Promise<CaptureOutcome>;
  busy?: boolean;
  /**
   * The password step's challenge, when there is no session yet. The preview
   * route accepts either, and refuses a caller with neither.
   */
  challenge?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("face");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isOn, setIsOn] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What is wrong with the frame on screen right now; null while it is fine. */
  const [hint, setHint] = useState<QualityReason | null>(null);
  /** Whether the guide has heard back at all yet; it is not green on silence. */
  const [hasPreview, setHasPreview] = useState(false);
  /** Consecutive passing previews. Reaching ARM_TICKS fires the capture. */
  const [armed, setArmed] = useState(0);
  /** When the camera may start counting again, on the same clock as Date.now. */
  const readyAt = useRef(0);
  /** True once the frames are gathered and the answer is what is left. */
  const [isSending, setIsSending] = useState(false);
  /** Set when the next attempt has to be asked for rather than taken. */
  const [halted, setHalted] = useState(false);
  /** What the last attempt came to, said where the eyes already are. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Free refusals since the last capture that was not one. */
  const freeRetries = useRef(0);

  const stop = useCallback(() => {
    closeCamera(streamRef.current);
    streamRef.current = null;
    setIsOn(false);
    setHasPreview(false);
    setArmed(0);
  }, []);

  // A camera that outlives the dialog it was opened in is the failure people
  // notice, because the indicator light stays on.
  useEffect(() => stop, [stop]);

  const isBusy = busy || isWorking;

  const run = useCallback(async () => {
    if (!videoRef.current || isBusy) return;
    setIsWorking(true);
    setIsSending(false);
    setArmed(0);
    setNotice(null);
    // Driven by the burst's own length rather than by the caller telling us:
    // enrolment and sign-in report their network phase differently, and the
    // frames take the same time either way.
    const sending = setTimeout(() => setIsSending(true), BURST_MS);
    try {
      const outcome = await onCapture(videoRef.current);
      setNotice(outcome.notice ?? null);

      if (outcome.verdict === "halt") {
        freeRetries.current = 0;
        setHalted(true);
      } else {
        freeRetries.current += 1;
        if (freeRetries.current >= MAX_FREE_RETRIES) {
          // Free to the server, but not to somebody watching it happen for
          // the fourth time with no idea whether it will ever stop.
          freeRetries.current = 0;
          setNotice(outcome.notice ?? null);
          setHalted(true);
        }
      }
    } finally {
      clearTimeout(sending);
      setIsSending(false);
      // Timed from the end of the work, not the start: a slow round trip has
      // already given somebody their pause.
      readyAt.current = Date.now() + COOLDOWN_MS;
      setIsWorking(false);
    }
  }, [isBusy, onCapture]);

  /** Asked for by a person, which is the whole point of stopping. */
  function resume() {
    freeRetries.current = 0;
    setNotice(null);
    setHalted(false);
    readyAt.current = Date.now() + COOLDOWN_MS;
  }

  /**
   * The live guide, and the thing that pulls the trigger.
   *
   * Runs only while the camera is on, idle, and not waiting to be asked. A
   * preview racing a capture would only compete for the service, and one that
   * kept counting while halted would defeat the halt.
   */
  useEffect(() => {
    if (!isOn || isBusy || halted) return;

    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let holdUntil = 0;

    /** Everything that ends the loop goes through here, so "stopped" always means "and said why". */
    const stop = (message: string) => {
      setError(message);
      cancelled = true;
    };

    /** A failed round trip: back off, jittered, and give up after enough of them. */
    const failed = () => {
      failures += 1;
      if (failures >= MAX_PREVIEW_FAILURES) {
        stop(t("serviceDown"));
        return;
      }
      const base = PREVIEW_BACKOFF_MS[Math.min(failures - 1, PREVIEW_BACKOFF_MS.length - 1)];
      holdUntil = Date.now() + base * (0.5 + Math.random());
    };

    const tick = async () => {
      if (inFlight || cancelled || !videoRef.current) return;
      // Nobody is looking, and the server should not be asked on their behalf.
      if (document.hidden) return;
      if (Date.now() < holdUntil) return;
      // The cooldown after a capture. Previews sent during it were thrown
      // away on arrival -- the count restarts when it ends anyway -- so now
      // they are not sent at all: five of the eight a sign-in used to cost.
      if (Date.now() < readyAt.current) {
        setArmed(0);
        return;
      }
      const frame = grabPreviewFrame(videoRef.current);
      if (!frame) return;

      inFlight = true;
      try {
        const response = await fetch(withBasePath("/api/face/preview"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame, challenge }),
        });
        if (cancelled) return;

        // The challenge from the password step lives two minutes. After that
        // every preview is a 401, and a tab left on this screen used to send
        // one every half second until somebody closed it.
        if (response.status === 401) {
          stop(t("previewExpired"));
          return;
        }
        if (response.status === 429) {
          stop(t("serviceBusy"));
          return;
        }

        let result: {
          success?: boolean;
          code?: string;
          data?: { ok?: boolean; reason?: QualityReason | null };
        };
        try {
          result = await response.json();
        } catch {
          // A proxy's HTML error page, or a body cut short: not an answer.
          failed();
          return;
        }

        if (result.code === "service-down") {
          // Said once, in the notice, and the polling stops: repeating it
          // several times a second would be the same message in a loop.
          stop(t("serviceDown"));
          return;
        }
        if (!result.success) {
          // Busy, or a 5xx that still managed a body: worth another try, later.
          failed();
          return;
        }

        failures = 0;
        setHasPreview(true);
        const passing = result.data?.ok === true;
        setHint(passing ? null : (result.data?.reason ?? null));

        if (!passing) {
          // Any bad frame puts the count back to the start. Counting through
          // a wobble would mean capturing on the strength of frames that had
          // already stopped being true.
          setArmed(0);
          return;
        }

        setArmed((previous) => {
          const next = previous + 1;
          if (next >= ARM_TICKS) {
            void run();
            return 0;
          }
          return next;
        });
      } catch {
        // A dropped connection, counted like any other failure.
        failed();
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = setInterval(tick, PREVIEW_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOn, isBusy, halted, challenge, t, run]);

  async function start() {
    setError(null);
    try {
      if (!videoRef.current) return;
      streamRef.current = await openCamera(videoRef.current);
      // The first count starts a beat after the picture appears rather than
      // the instant it does, so nobody is captured mid-blink while still
      // finding the camera.
      readyAt.current = Date.now() + START_DELAY_MS;
      setIsOn(true);
    } catch (caught) {
      // Three different problems that all look like "the camera did not
      // open", and three different places to go and fix them. Telling them
      // apart is the whole value of this branch.
      if (caught instanceof InsecureContextError) {
        setError(t("cameraInsecure"));
        return;
      }
      const name = caught instanceof DOMException ? caught.name : "";
      setError(
        name === "NotFoundError" || name === "OverconstrainedError"
          ? t("cameraMissing")
          : t("cameraDenied")
      );
    }
  }

  const isGood = hasPreview && hint === null;

  /**
   * One line on the picture, saying the next thing to do.
   *
   * Order matters. What just failed outranks the countdown, and a live fault
   * outranks both: standing in the wrong place matters more than blinking,
   * because a blink in a bad frame is wasted anyway.
   */
  const status = isBusy
    ? isSending || busy
      ? t("checking")
      : t("blinkNow")
    : notice
      ? notice
      : armed > 0
        ? t("autoIn", { count: ARM_TICKS - armed })
        : hint
          ? t(hint)
          : hasPreview
            ? t("autoHold")
            : t("positioning");

  return (
    <div className="flex flex-col gap-3">
      {/*
        Sized by height, and still 4:3.

        The ratio is not cosmetic. FaceGuide draws its oval from fractions of
        the video frame, the same fractions the checker refuses on -- so a box
        that is not 4:3 gets object-cover cropping underneath it, and the oval
        starts marking a spot the checker will then reject. A guide that lies
        is worse than no guide.

        So the cap is on height and the width follows. On a short window the
        camera shrinks and the buttons stay where they are, which is the way
        round that keeps the page usable.
      */}
      <div className="relative mx-auto aspect-[4/3] max-h-[38dvh] w-full max-w-full overflow-clip rounded-xl bg-muted">
        <video
          ref={videoRef}
          playsInline
          muted
          // Mirrored, because an unmirrored view of yourself is disorienting
          // and people move the wrong way trying to centre themselves.
          className="size-full -scale-x-100 object-cover"
        />
        {!isOn ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button type="button" variant="outline" className="gap-2" onClick={start}>
              <IoCameraOutline className="size-4" />
              {t("start")}
            </Button>
          </div>
        ) : null}

        {/* Where to put your face, drawn from the same numbers the checker
            refuses on. Green once the live preview says the frame passes,
            which is the strongest guide available because it needs no
            reading at all. */}
        {isOn ? <FaceGuide isGood={isGood && !halted} /> : null}

        {/* The count, big enough to be read without looking away from the
            lens -- which is where somebody has to keep looking for it to
            reach zero at all. */}
        {isOn && armed > 0 && !isBusy && !halted ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="animate-in zoom-in-50 text-6xl font-semibold text-white drop-shadow-lg duration-200">
              {ARM_TICKS - armed}
            </span>
          </div>
        ) : null}

        {/* Asking, rather than taking. On the picture, because that is where
            somebody who has just been refused is still looking. */}
        {isOn && halted && !isBusy ? (
          <div className="animate-in fade-in absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 bg-black/55 duration-200">
            <Button type="button" variant="secondary" className="gap-2" onClick={resume}>
              <IoRefreshOutline className="size-4" />
              {t("tryAgain")}
            </Button>

          </div>
        ) : null}

        {isOn ? (
          <div className="animate-in fade-in absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/65 px-3 py-2 text-center text-sm font-medium text-white duration-200">
            {isBusy ? <IoReloadOutline className="size-4 shrink-0 animate-spin" /> : null}
            {status}
          </div>
        ) : null}
      </div>

      {/* What this capture is for. Below the picture rather than on it: it is
          read once, before the camera is even on. */}
      <p className="text-center text-sm text-muted-foreground">{statusLabel}</p>

      {children}

      <InlineNotice tone="error">{error}</InlineNotice>
    </div>
  );
}
