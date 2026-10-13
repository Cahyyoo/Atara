"use client";

import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import type { SecondFactorMethod } from "@/core/lib/auth/second-factor";
import { IoArrowBack, IoKeypadOutline, IoPhonePortraitOutline, IoScanOutline } from "react-icons/io5";

/**
 * Picking the second factor, for an account that has more than one.
 *
 * Shown after the password and before any camera or code, so that somebody
 * whose face will not read today -- a mask, safety glasses, the light over
 * the bench -- is never made to fail at the camera first.
 */
export function MethodChooser({
  methods,
  name,
  onChoose,
  onCancel,
}: {
  methods: SecondFactorMethod[];
  name: string;
  onChoose: (method: SecondFactorMethod) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("mfa");
  const tFace = useTranslations("face");

  const options: Record<
    SecondFactorMethod,
    { label: string; hint: string; icon: ComponentType<{ className?: string }> }
  > = {
    face: { label: t("methodFace"), hint: t("methodFaceHint"), icon: IoScanOutline },
    totp: { label: t("methodTotp"), hint: t("methodTotpHint"), icon: IoKeypadOutline },
    "totp-setup": { label: t("methodSetup"), hint: t("methodSetupHint"), icon: IoPhonePortraitOutline },
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("stepOf", { current: 2, total: 2 })} · {t("chooseTitle")}
        </p>
        <p className="font-medium">{tFace("greeting", { name })}</p>
        <p className="text-sm text-muted-foreground">{t("chooseSubtitle")}</p>
      </div>

      <div className="flex flex-col gap-2">
        {methods.map((method) => {
          const option = options[method];
          const Icon = option.icon;
          return (
            <button
              key={method}
              type="button"
              onClick={() => onChoose(method)}
              className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

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
