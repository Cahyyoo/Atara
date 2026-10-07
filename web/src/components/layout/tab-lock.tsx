"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { makeClaim, shouldYield, TAB_CHANNEL } from "@/lib/tab-claim";

/**
 * Keeps the app to one tab, like WhatsApp Web.
 *
 * A tab claims the app when it opens. Every other tab hears the claim and is
 * covered by a dialog that cannot be dismissed, with one way out: "Use in
 * this tab", which claims it back and covers the other one instead. Nothing
 * is signed out and nothing reloads; the tab is simply set aside.
 *
 * Browsers without BroadcastChannel get no lock at all rather than a broken
 * page: every current browser has it, and a missing API must not mean a
 * missing app.
 */
export function TabLock() {
  const t = useTranslations("tab");
  const [locked, setLocked] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const tabId = useRef<string>("");

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    tabId.current = crypto.randomUUID();
    const opened = new BroadcastChannel(TAB_CHANNEL);
    channel.current = opened;

    opened.onmessage = (event: MessageEvent) => {
      if (shouldYield(event.data, tabId.current)) setLocked(true);
    };
    // Opening the app here is claiming it: the newest tab wins.
    opened.postMessage(makeClaim(tabId.current));

    return () => {
      opened.close();
      channel.current = null;
    };
  }, []);

  function claimHere() {
    channel.current?.postMessage(makeClaim(tabId.current));
    setLocked(false);
  }

  if (!locked) return null;

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={claimHere}>
            {t("useHere")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
