"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { toast } from "@/core/components/ui/toast";
import { apiFetch, jsonBody } from "@/core/lib/http/api-client";
import { cn } from "@/core/lib/utils";
import type { LabSettings } from "@/modules/lab/lib/settings/lab-settings";

/**
 * The lab admin's switches. Each one saves the moment it is flipped, and goes
 * back if the server refuses: there is no form to submit and nothing to forget.
 */
export function LabSettingsForm({ initial }: { initial: LabSettings }) {
  const t = useTranslations("labSettings");
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function update(change: Partial<LabSettings>) {
    const before = settings;
    setSettings({ ...settings, ...change });
    setSaving(true);
    const outcome = await apiFetch<LabSettings>("/api/lab-settings", jsonBody("PATCH", change));
    setSaving(false);
    if (outcome.ok) {
      setSettings(outcome.data);
      toast(t("saved"));
    } else {
      setSettings(before);
      toast(outcome.error, "error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mobileTitle")}</CardTitle>
        <CardDescription>{t("mobileSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingSwitch
          label={t("mobileShowSampleIdent")}
          hint={settings.mobileShowSampleIdent ? t("mobileShowSampleIdentOn") : t("mobileShowSampleIdentOff")}
          checked={settings.mobileShowSampleIdent}
          disabled={saving}
          onChange={(checked) => update({ mobileShowSampleIdent: checked })}
        />
      </CardContent>
    </Card>
  );
}

function SettingSwitch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}
