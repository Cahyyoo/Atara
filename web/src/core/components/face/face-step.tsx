"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isSecondFactorMethod, type SecondFactorMethod } from "@/core/lib/auth/second-factor";
import { Button } from "@/core/components/ui/button";
import { FaceCamera } from "@/core/components/face/face-camera";
import { toast } from "@/core/components/ui/toast";
import { formatDiagnostics } from "@/core/lib/face/face-diagnostics";
import { captureBurst, interpretRefusal } from "@/core/lib/face/face-client";
import type { CaptureOutcome } from "@/core/components/face/face-camera";
import { IoArrowBack } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/**
 * The second half of signing in.
 *
 * Reached only after the password was accepted, and only for accounts with a
 * face enrolled. There is no session yet: the server held the cookie back, so
 * backing out of here means starting again rather than slipping past.
 *
 * Nothing is judged here. The frames go to the server and the answer comes
 * back, which is what makes the blink check mean something -- it used to run
 * in this file, on the machine of the person being checked.
 *
 * There is no Verify button. The camera fires when the framing has been good
 * for a second and a half, and a missed blink does not end the sitting: the
 * challenge is only spent once a burst reaches the comparison, so it simply
 * counts down again.
 *
 * A face that was compared and did not match is the exception, and the reason
 * this file decides anything at all. That costs one of five attempts before
 * the account locks for fifteen minutes, and a camera on a timer would spend
 * all five in about half a minute. So it stops and waits to be asked.
 */
export function FaceStep({
  challenge,
  name,
  onVerified,
  onContinue,
  onCancel,
  onSwitchMethod,
}: {
  challenge: string;
  name: string;
  onVerified: () => void;
  /**
   * The face matched but the sign-in is not finished: an authenticator setup
   * is waiting, and the server handed back the next step instead of a
   * session. The parent takes over from there.
   */
  onContinue?: (next: { challenge: string; methods: SecondFactorMethod[] }) => void;
  onCancel: () => void;
  /** Present when the account has another second factor to fall back on. */
  onSwitchMethod?: () => void;
}) {
  const t = useTranslations("face");
  const tMfa = useTranslations("mfa");
  const tCommon = useTranslations("common");
  const [isSending, setIsSending] = useState(false);
  /**
   * Where a result is said, decided by whether it is worth looking away for.
   *
   * A refusal the camera will retry goes on the picture, because the person
   * it is for is staring at the lens and the notice stack is the furthest
   * point on the screen from it. Anything that ends the sitting -- matched,
   * did not match, service down -- gets a notification, which is what those
   * are for.
   */
  async function verify(video: HTMLVideoElement): Promise<CaptureOutcome> {
    const burst = await captureBurst(video);
    if (burst.blank) {
      // Caught before uploading: a burst of black frames is a waste of 400KB
      // to be told they were black. Nothing about a covered lens improves by
      // trying again in four seconds.
      return { verdict: "halt", notice: t("cameraBlank") };
    }

    setIsSending(true);
    try {
      const response = await fetch(withBasePath("/api/auth/face"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge,
          frames: burst.frames,
          videoWidth: burst.videoWidth,
          videoHeight: burst.videoHeight,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        const refusal = interpretRefusal(result);
        if (refusal) {
          /**
           * To the console, not to the screen.
           *
           * "video 640x480 · 12/12 frames with a face · best score 0.93
           * (floor 0.50)" is a sentence for whoever wrote the checker. The
           * person reading it is trying to sign in, and it tells them nothing
           * they can do. It stays reachable for the one case that needs it --
           * somebody reporting that their face is never detected -- and
           * nowhere else.
           */
          if (refusal.diagnostics) {
            console.debug("[face]", formatDiagnostics(refusal.diagnostics));
          }
          /**
           * On the picture, not in the corner.
           *
           * Somebody being told to blink is looking at the lens; the notice
           * stack is the furthest point on the screen from it, and the same
           * sentence used to arrive there twice. A refusal the camera is
           * about to retry belongs in the caption bar it is already reading.
           */
          return {
            verdict: refusal.canRetry ? "retry" : "halt",
            notice: t(refusal.messageKey),
          };
        }

        /**
         * A face that was compared and did not match.
         *
         * This is the one that costs something: one of five attempts before
         * the account locks for fifteen minutes. The camera fires on a timer,
         * so left to retry it would spend all five in about half a minute
         * with nobody pressing anything. It stops, and it says so loudly --
         * this is worth looking away from the lens for.
         */
        toast(result.error ?? tCommon("networkError"), "error");
        return { verdict: "halt" };
      }

      // Matched, not signed in: the account has an authenticator setup
      // waiting and the face was the price of starting it. No cookie came
      // back; the challenge did, marked as face-verified.
      if (result.data?.mfaRequired && onContinue) {
        const methods: unknown[] = Array.isArray(result.data.methods) ? result.data.methods : [];
        onContinue({
          challenge: result.data.challenge,
          methods: methods.filter(isSecondFactorMethod),
        });
        return { verdict: "halt" };
      }

      // Fired, then the redirect happens immediately. The toaster sits in
      // the root layout and does not remount, so this arrives on the page
      // being navigated to rather than being cut off -- and nothing waits.
      toast(t("verified"));
      onVerified();
      return { verdict: "halt" };
    } catch {
      toast(tCommon("networkError"), "error");
      return { verdict: "halt" };
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        {/* Which step this is, because the password screen never said there
            would be a second one and an unexpected camera reads as a fault. */}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("stepOf", { current: 2, total: 2 })} · {t("title")}
        </p>
        <p className="font-medium">{t("greeting", { name })}</p>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <FaceCamera
        statusLabel={t("autoVerify")}
        onCapture={verify}
        busy={isSending}
        challenge={challenge}
      />

      {/*
        Both ways out, on one row.

        They are alternatives to each other -- try a different factor, or go
        back and start over -- which reads better side by side than stacked,
        and stacking them was most of what pushed the last button off the
        bottom of the screen.

        Named for what they do, not for what they are: no session exists yet,
        so the second really does send you back to the password, and "Cancel"
        invites being pressed as "try again".
      */}
      {onSwitchMethod ? (
        <Button type="button" variant="outline" disabled={isSending} onClick={onSwitchMethod}>
          {tMfa("useAnotherMethod")}
        </Button>
      ) : null}

      <button
        type="button"
        onClick={onCancel}
        className="-mt-1 inline-flex items-center justify-center gap-1.5 self-center rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <IoArrowBack className="size-3.5" />
        {t("backToPassword")}
      </button>
    </div>
  );
}
