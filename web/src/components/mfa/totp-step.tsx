"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TotpCodeForm } from "@/components/mfa/totp-code-form";
import { IoArrowBack } from "react-icons/io5";

/** The second half of signing in, by a code from the authenticator app. */
export function TotpStep({
  challenge,
  name,
  onVerified,
  onCancel,
  onSwitchMethod,
}: {
  challenge: string;
  name: string;
  onVerified: () => void;
  onCancel: () => void;
  onSwitchMethod?: () => void;
}) {
  const t = useTranslations("mfa");
  const tFace = useTranslations("face");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("stepOf", { current: 2, total: 2 })} · {t("totpTitle")}
        </p>
        <p className="font-medium">{tFace("greeting", { name })}</p>
        <p className="text-sm text-muted-foreground">{t("totpSubtitle")}</p>
      </div>

      <TotpCodeForm challenge={challenge} successMessage={t("verified")} onVerified={onVerified} />

      {onSwitchMethod ? (
        <Button type="button" variant="outline" onClick={onSwitchMethod}>
          {t("useAnotherMethod")}
        </Button>
      ) : null}

      {/* The same quiet link the face step uses, so the two flows do not
          disagree about what a way out looks like. */}
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
