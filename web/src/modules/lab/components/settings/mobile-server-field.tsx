"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { toast } from "@/core/components/ui/toast";
import { apiFetch, jsonBody } from "@/core/lib/http/api-client";
import type { LabSettings } from "@/modules/lab/lib/settings/lab-settings";

/**
 * The server address every mobile app follows.
 *
 * Saved with a button rather than on every keystroke: the server tests each
 * address before keeping it, and a half-typed one would only be refused.
 */
export function MobileServerField({
  initial,
  onSaved,
}: {
  initial: string;
  onSaved: (settings: LabSettings) => void;
}) {
  const t = useTranslations("labSettings");
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const outcome = await apiFetch<LabSettings>("/api/lab-settings", jsonBody("PATCH", { mobileServerUrl: value }));
    setSaving(false);
    if (outcome.ok) {
      setValue(outcome.data.mobileServerUrl);
      setSaved(outcome.data.mobileServerUrl);
      onSaved(outcome.data);
      toast(t("saved"));
      return;
    }
    // The statuses the server gives for its three refusals; anything else is
    // its own message.
    const byStatus: Record<number, string> = {
      422: t("mobileServerUrlInvalid"),
      502: t("mobileServerUrlUnreachable"),
      409: t("mobileServerUrlOtherServer"),
    };
    setError(byStatus[outcome.status] ?? outcome.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="mobile-server-url">{t("mobileServerUrl")}</Label>
      <div className="flex gap-2">
        <Input
          id="mobile-server-url"
          value={value}
          placeholder="http://10.10.50.14:3000/api"
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          disabled={saving}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value !== saved) void save();
          }}
          className="font-mono"
        />
        <Button type="button" disabled={saving || value.trim() === saved} onClick={save}>
          {saving ? t("mobileServerUrlChecking") : t("mobileServerUrlSave")}
        </Button>
      </div>
      <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={error ? "alert" : undefined}>
        {error ?? t("mobileServerUrlHint")}
      </p>
    </div>
  );
}
