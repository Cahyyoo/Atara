"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { tourFor, tourHref } from "@/lib/tours";
import type { ApiResult, SampleListItemDTO } from "@/types";
import { IoPlayOutline, IoReloadOutline } from "react-icons/io5";

/**
 * "Try it": opens the page a section explains with its guided tour running.
 * A sample's own page needs a sample, so that tour opens the newest one.
 */
export function TryTourButton({ tourKey, className }: { tourKey: string; className?: string }) {
  const t = useTranslations("tour");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const tour = tourFor(tourKey);
  if (!tour) return null;

  async function start() {
    if (!tour) return;
    if (tour.path !== "latest-sample") {
      router.push(tourHref(tour));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/samples?pageSize=1&sort=createdAt&order=desc");
      const body: ApiResult<{ samples: SampleListItemDTO[] }> = await response.json();
      const newest = body.success ? body.data.samples[0] : undefined;
      if (!newest) {
        toast(t("noSample"), "error");
        return;
      }
      router.push(tourHref(tour, `/samples/${encodeURIComponent(newest.sampleCode)}`));
    } catch {
      toast(t("noSample"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" className={className} disabled={busy} onClick={() => void start()}>
      {busy ? <IoReloadOutline className="size-3.5 animate-spin" /> : <IoPlayOutline className="size-3.5" />}
      {t("start")}
    </Button>
  );
}
