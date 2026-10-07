"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { TotpCodeForm } from "@/components/mfa/totp-code-form";
import { cn } from "@/lib/utils";
import { IoArrowBack, IoArrowForward, IoReloadOutline } from "react-icons/io5";

interface Setup {
  otpauthUri: string;
  manualKey: string;
}

type Phase = "scan" | "code";

/**
 * Connecting an authenticator app, in the middle of signing in.
 *
 * An admin asked for it; the person does it here, on their own phone, and
 * nobody else ever sees the QR code. The first code the phone shows is what
 * both switches the factor on and signs them in.
 *
 * Two screens rather than one, the way Microsoft's own setup does it: first
 * the QR code, then the code. Everything on one screen -- install, scan,
 * manual key, code field -- put four things in competition, and laid out in
 * two columns it split "enter the code" from the field it was about. One
 * screen per thing to do keeps the card as narrow as every other step.
 *
 * Going back to the QR code does not ask the server for a new one: the secret
 * made on the way in is the one the phone may already have scanned.
 *
 * Built to fit the window without scrolling, which is why nothing here opens
 * downwards: the manual key takes the QR code's place rather than appearing
 * under it, the QR code shrinks with the window's height, and the two ways out
 * share one line instead of stacking.
 */
export function TotpSetupStep({
  challenge,
  onChallenge,
  onVerified,
  onCancel,
  onSwitchMethod,
}: {
  challenge: string;
  /** Accepted for the same shape as the other steps; this one does not greet. */
  name: string;
  /** The setup hands back a fresh challenge; the parent keeps the latest. */
  onChallenge: (challenge: string) => void;
  onVerified: () => void;
  onCancel: () => void;
  onSwitchMethod?: () => void;
}) {
  const t = useTranslations("mfa");
  const tCommon = useTranslations("common");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [phase, setPhase] = useState<Phase>("scan");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  // The challenge the setup was made with, so the effect below runs once
  // even though the parent swaps the challenge for the fresh one it returns.
  const startedWith = useRef<string | null>(null);

  const start = useCallback(
    async (withChallenge: string) => {
      setError(null);
      setIsLoading(true);
      try {
        const response = await fetch("/api/auth/totp/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ challenge: withChallenge }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(result.error ?? tCommon("networkError"));
          return;
        }

        setSetup({ otpauthUri: result.data.otpauthUri, manualKey: result.data.manualKey });
        startedWith.current = result.data.challenge;
        onChallenge(result.data.challenge);
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setIsLoading(false);
      }
    },
    [onChallenge, tCommon]
  );

  useEffect(() => {
    // Once per step, not once per render: every call replaces the secret, so
    // a second one would silently invalidate a QR code already scanned.
    if (startedWith.current !== null) return;
    startedWith.current = challenge;
    void start(challenge);
  }, [challenge, start]);

  const linkClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("stepOf", { current: 2, total: 2 })} · {t("setupTitle")}
        </p>
        <SetupProgress phase={phase} scanLabel={t("progressScan")} codeLabel={t("progressCode")} />
      </div>

      {phase === "scan" ? (
        <>
          <div className="flex flex-col gap-0.5 text-center">
            <p className="font-medium">{t("setupScanTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("setupScanHint")}</p>
          </div>

          {setup ? (
            <div className="flex flex-col items-center gap-1.5">
              {/*
                One box, two contents. The key replaces the QR code instead of
                opening underneath it, so asking for it never makes the card
                taller -- it is what to do *instead of* scanning, and it takes
                the scan's place.

                Sized from the window's height: tall enough for any phone
                camera to read on an ordinary screen, and giving way first on a
                short one, before anything is pushed out of view.
              */}
              <div className="flex size-[clamp(108px,21dvh,164px)] items-center justify-center rounded-xl bg-white p-2 ring-1 ring-border">
                {!showKey ? (
                  // White behind the code whatever the theme: phone cameras
                  // read dark-on-light, and an inverted code is often not read.
                  <QRCodeSVG
                    value={setup.otpauthUri}
                    size={256}
                    level="M"
                    role="img"
                    aria-label={t("qrLabel")}
                    className="size-full"
                  />
                ) : (
                  // break-words, not break-all: a key typed by hand is exactly
                  // the one whose groups of four must stay whole.
                  <code className="select-all break-words text-center font-mono text-sm leading-relaxed tracking-wider text-neutral-900">
                    {setup.manualKey}
                  </code>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowKey((previous) => !previous)}
                className="rounded-md px-2 py-0.5 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {showKey ? t("showQrCode") : t("manualKey")}
              </button>
            </div>
          ) : isLoading ? (
            <p className="flex h-[clamp(108px,21dvh,164px)] items-center justify-center gap-2 text-sm text-muted-foreground">
              <IoReloadOutline aria-hidden className="size-4 animate-spin" />
              {t("setupLoading")}
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="animate-in fade-in slide-in-from-top-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-200"
            >
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            className="h-10 w-full gap-2"
            disabled={!setup}
            onClick={() => setPhase("code")}
          >
            {t("next")}
            <IoArrowForward aria-hidden className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-0.5 text-center">
            <p className="font-medium">{t("setupCodeTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("setupCodeHint")}</p>
          </div>

          <TotpCodeForm challenge={challenge} successMessage={t("enrolled")} onVerified={onVerified} />

          <button type="button" onClick={() => setPhase("scan")} className={cn(linkClass, "-mt-1 self-center")}>
            <IoArrowBack className="size-3.5" />
            {t("showQrAgain")}
          </button>
        </>
      )}

      {/* Both ways out on one line: stacked, with a divider above them, they
          cost as much height as the QR code's caption and the button together. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4">
        <button type="button" onClick={onCancel} className={linkClass}>
          <IoArrowBack className="size-3.5" />
          {t("backToPassword")}
        </button>
        {onSwitchMethod ? (
          <button type="button" onClick={onSwitchMethod} className={cn(linkClass, "text-foreground")}>
            {t("useAnotherMethod")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Where in the setup this is: two dots and the line between them.
 *
 * Small on purpose. "Step 2 of 2" above already says where this is in signing
 * in; this only says where it is in the setup, and a second numbered heading
 * would read as a second count.
 */
function SetupProgress({
  phase,
  scanLabel,
  codeLabel,
}: {
  phase: Phase;
  scanLabel: string;
  codeLabel: string;
}) {
  const dot = (active: boolean, label: string, current: boolean) => (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        active ? "font-medium text-foreground" : "text-muted-foreground"
      )}
      aria-current={current ? "step" : undefined}
    >
      <span className={cn("size-2 rounded-full", active ? "bg-primary" : "bg-muted-foreground/30")} />
      {label}
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      {dot(true, scanLabel, phase === "scan")}
      <span
        aria-hidden
        className={cn("h-px w-8", phase === "code" ? "bg-primary" : "bg-muted-foreground/30")}
      />
      {dot(phase === "code", codeLabel, phase === "code")}
    </div>
  );
}
