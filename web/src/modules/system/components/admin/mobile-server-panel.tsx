"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { toast } from "@/core/components/ui/toast";
import { apiFetch, jsonBody } from "@/core/lib/http/api-client";

/**
 * The server address every mobile app follows.
 *
 * Saved with a button rather than on every keystroke: the server tests each
 * address before keeping it, and a half-typed one would only be refused.
 */
export function MobileServerPanel({ initial }: { initial: string }) {
  const t = useTranslations("mobileServer");
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only after this server failed to reach the address: the admin may know
  // better, and each phone still checks it before it moves.
  const [canForce, setCanForce] = useState(false);

  async function save(force = false) {
    setSaving(true);
    setError(null);
    setCanForce(false);
    const outcome = await apiFetch<{ mobileServerUrl: string }>(
      "/api/admin/mobile-server",
      jsonBody("PATCH", { mobileServerUrl: value, force })
    );
    setSaving(false);
    if (outcome.ok) {
      setValue(outcome.data.mobileServerUrl);
      setSaved(outcome.data.mobileServerUrl);
      toast(t("saved"));
      return;
    }
    // The statuses the server gives for its three refusals; anything else is
    // its own message.
    const byStatus: Record<number, string> = {
      422: t("invalid"),
      502: t("unreachable"),
      409: t("otherServer"),
    };
    setError(byStatus[outcome.status] ?? outcome.error);
    setCanForce(outcome.status === 502);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Label htmlFor="mobile-server-url">{t("label")}</Label>
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
              setCanForce(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && value.trim() !== saved) void save();
            }}
            className="font-mono"
          />
          <Button type="button" disabled={saving || value.trim() === saved} onClick={() => save()}>
            {saving ? t("checking") : t("save")}
          </Button>
        </div>
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={error ? "alert" : undefined}>
          {error ?? t("hint")}
        </p>
        {canForce ? (
          <Button type="button" variant="outline" className="self-start" disabled={saving} onClick={() => save(true)}>
            {t("forceSave")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
