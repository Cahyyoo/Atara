"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { useTranslations } from "next-intl";
import { safeRedirectPath } from "@/core/lib/auth/safe-redirect";
import { SIGN_IN_REASON } from "@/core/lib/auth/session-codes";
import { SecondFactorStep } from "@/core/components/mfa/second-factor-step";
import { isSecondFactorMethod, type SecondFactorMethod } from "@/core/lib/auth/second-factor";
import { IoEyeOffOutline, IoEyeOutline, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

export function LoginForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Not prefilled: a real account name on the sign-in page is a free hint.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Set when the password was right and the account has a second factor:
   * a face, an authenticator app, or an authenticator still to be set up.
   *
   * No session exists at this point -- the server deliberately withheld the
   * cookie -- so leaving this screen means starting the sign-in again.
   */
  const [pending, setPending] = useState<{
    challenge: string;
    name: string;
    methods: SecondFactorMethod[];
  } | null>(null);
  /**
   * Arrived here because something other than this device ended its session:
   * a sign-in elsewhere, an administrator, or a password change.
   */
  const reason = searchParams.get("reason");
  const notice =
    reason === SIGN_IN_REASON.replaced
      ? t("replacedNotice")
      : reason === SIGN_IN_REASON.ADMIN_ENDED
        ? t("endedByAdminNotice")
        : reason === SIGN_IN_REASON.PASSWORD_CHANGED
          ? t("passwordChangedNotice")
          : null;

  function finish(mustChangePassword = false) {
    // Never redirect off-site on someone else's say-so.
    const next = safeRedirectPath(searchParams.get("next"));
    // A password an administrator chose is replaced first; the app layout
    // would send them there anyway, this saves the detour.
    router.push(mustChangePassword ? `/change-password?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // No "continue here?": the latest sign-in wins, and whichever browser it
      // replaces is told so by its SessionWatch.
      const response = await fetch(withBasePath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error ?? t("signInFailed"));
        return;
      }

      if (result.data?.mfaRequired) {
        // Password accepted, no cookie issued. The second factor is the only
        // way on from here.
        const methods: unknown[] = Array.isArray(result.data.methods) ? result.data.methods : [];
        setPending({
          challenge: result.data.challenge,
          name: result.data.user.name,
          methods: methods.filter(isSecondFactorMethod),
        });
        return;
      }

      finish(result.data?.mustChangePassword === true);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pending) {
    return (
      <SecondFactorStep
        challenge={pending.challenge}
        name={pending.name}
        methods={pending.methods}
        onVerified={() => finish()}
        onCancel={() => setPending(null)}
      />
    );
  }

  return (
    <>
      <p className="text-center text-sm text-muted-foreground">{t("subtitle")}</p>
      {/* Why they are here. Said once, above the form, and not as an error:
          nothing they did was wrong. */}
      {notice ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          // The cursor belongs in the first field on a page that does nothing else.
          autoFocus
          required
          className="h-10"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-10 pr-10"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {/* A typo in a masked field is the most common reason a correct
              password is reported as wrong, and every failure here costs an
              attempt against the lockout. */}
          <button
            type="button"
            // Not in the tab order: it sits between the password and the submit
            // button, where an unexpected stop is more annoying than useful.
            tabIndex={-1}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((previous) => !previous)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            {showPassword ? <IoEyeOffOutline className="size-4" /> : <IoEyeOutline className="size-4" />}
          </button>
        </div>
      </div>

      {/*
        The one error strip in the app that is not an <InlineNotice>, and
        deliberately so. Login is its own entry, so importing the motion
        library here ships a second copy of it: measured at 147.5 KB for this
        one paragraph, on the page every user hits first and unauthenticated.
        tw-animate-css does the same arrival for nothing, and the
        prefers-reduced-motion block in globals.css covers it either way.
        role="alert" so the failure is announced, not just recoloured.
      */}
      {error ? (
        <p
          role="alert"
          className="animate-in fade-in slide-in-from-top-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-200"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="mt-1 h-10 w-full gap-2">
        {isSubmitting ? <IoReloadOutline aria-hidden className="size-4 animate-spin" /> : null}
        {t("signIn")}
      </Button>
      </form>
    </>
  );
}
