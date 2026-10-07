"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { downloadFromApi } from "@/lib/download";
import type { ApiResult } from "@/types";
import { IoCloudDownloadOutline, IoReloadOutline } from "react-icons/io5";

type Counts = Record<"samples" | "logs" | "changes" | "masterOptions" | "stages" | "users", number>;

/** The whole database as one workbook, with how big it is before it is asked for. */
export function BackupPanel() {
  const t = useTranslations("backup");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/admin/backup?counts=1", { signal: controller.signal });
        const body: ApiResult<Counts> = await response.json();
        if (body.success) setCounts(body.data);
      } catch {
        // The counts are a courtesy; the button works without them.
      }
    })();
    return () => controller.abort();
  }, []);

  async function download() {
    setBusy(true);
    const message = await downloadFromApi("/api/admin/backup", "atara-backup.xlsx");
    setBusy(false);
    toast(message ?? t("done"), message ? "error" : "success");
  }

  const items = counts
    ? [
        [t("samples"), counts.samples],
        [t("logs"), counts.logs],
        [t("changes"), counts.changes],
        [t("masterOptions"), counts.masterOptions],
        [t("users"), counts.users],
      ]
    : [];

  return (
    <Card data-tour="admin-backup">
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length > 0 ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {items.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("excluded")}</p>
        <div>
          <Button className="gap-2" disabled={busy} onClick={() => void download()}>
            {busy ? (
              <IoReloadOutline className="size-4 animate-spin" />
            ) : (
              <IoCloudDownloadOutline className="size-4" />
            )}
            {busy ? t("preparing") : t("download")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
