"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { toast } from "@/core/components/ui/toast";
import { tourFor, tourHref } from "@/core/lib/app/tours";
import { IoPlayOutline, IoReloadOutline } from "react-icons/io5";

/**
 * "Try it": opens the page a section explains with its guided tour running.
 * A tour whose page needs something to exist first (a sample's own page)
 * asks its module where to open (`resolvePath`).
 */
export function TryTourButton({ tourKey, className }: { tourKey: string; className?: string }) {
  const t = useTranslations("tour");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const tour = tourFor(tourKey);
  if (!tour) return null;

  async function start() {
    if (!tour) return;
    if (!tour.resolvePath) {
      router.push(tourHref(tour));
      return;
    }
    setBusy(true);
    try {
      const path = await tour.resolvePath();
      if (path) router.push(tourHref(tour, path));
      else toast(t("noSample"), "error");
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
