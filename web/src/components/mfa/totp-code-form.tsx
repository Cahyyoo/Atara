"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/mfa/otp-input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { TOTP_MISMATCH_CODE } from "@/lib/second-factor";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

const CODE_LENGTH = 6;

/**
 * Six digits from the phone, sent to the step that issues the session.
 *
 * Sends itself when the sixth digit lands, because that is the moment the
 * person is done and a button press is one more thing between them and the
 * thirty-second window closing. The button stays for anyone who pasted, or
 * who wants to check before sending.
 */
export function TotpCodeForm({
  challenge,
  successMessage,
  onVerified,
  autoFocus = true,
}: {
  challenge: string;
  /** Said once the code is accepted, just before the redirect. */
  successMessage: string;
  onVerified: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("mfa");
  const tCommon = useTranslations("common");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Back in the boxes after a refusal.
   *
   * The input is disabled while a code is checked, which takes the focus
   * away; without this, the next code would be typed into nothing.
   */
  useEffect(() => {
    if (error && !isSubmitting) inputRef.current?.focus();
  }, [error, isSubmitting]);

  async function submit(value: string) {
    if (value.length !== CODE_LENGTH || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(withBasePath("/api/auth/totp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code: value }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        // Cleared so the next code can simply be typed, not edited over.
        setCode("");
        setError(result.code === TOTP_MISMATCH_CODE ? t("mismatch") : (result.error ?? tCommon("networkError")));
        return;
      }

      toast(successMessage);
      onVerified();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleChange(raw: string) {
    // Digits only: Authenticator shows the code as "123 456", and a pasted
    // space should not be a reason to be told the code is wrong.
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    // Typing again is answering the error, so it stops being shown as one.
    if (digits.length > 0) setError(null);
    if (digits.length === CODE_LENGTH) void submit(digits);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(code);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col">
        {/* For screen readers only: every screen that shows these boxes has
            already said "enter the 6-digit code" in its own words just above,
            and saying it twice costs a line the window may not have. */}
        <Label htmlFor="totp-code" className="sr-only">
          {t("codeLabel")}
        </Label>
        <OtpInput
          ref={inputRef}
          id="totp-code"
          value={code}
          onChange={handleChange}
          length={CODE_LENGTH}
          disabled={isSubmitting}
          autoFocus={autoFocus}
          invalid={error !== null}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="animate-in fade-in slide-in-from-top-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive duration-200"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isSubmitting || code.length !== CODE_LENGTH}
        className="h-10 w-full gap-2"
      >
        {isSubmitting ? <IoReloadOutline aria-hidden className="size-4 animate-spin" /> : null}
        {t("verify")}
      </Button>
    </form>
  );
}
