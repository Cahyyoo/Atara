"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  isSessionEndedReason,
  SESSION_ENDED_CODE,
  SESSION_REPLACED_CODE,
  SIGN_IN_REASON,
  type SessionEndedReason,
} from "@/lib/session-codes";
import {
  deviceDetailRows,
  formatSessionTime,
  parseDeviceInfo,
  type DeviceInfo,
} from "@/lib/session-client";

/**
 * How often an open tab asks whether it is still the signed-in device.
 *
 * Fifteen seconds is "promptly" for somebody who has just signed in on
 * another laptop and looks back at this one, and at one primary-key read per
 * request it costs the server nothing worth counting. A hidden tab does not
 * ask at all: it asks the moment it is looked at again instead.
 */
export const SESSION_CHECK_MS = 15_000;

/**
 * Tells this browser, promptly, that a sign-in on another device ended its
 * session -- the WhatsApp Web behaviour -- or that an administrator or a
 * password change did.
 *
 * Without it the tab would go on showing a dashboard it can no longer load,
 * and the first sign of trouble would be a failed click with a bare "sign in
 * again". This says what happened, where, and when, and offers the way back.
 * The dialog cannot be dismissed: there is nothing left behind it to use.
 */
export function SessionWatch() {
  const t = useTranslations("session");
  const router = useRouter();
  const [replaced, setReplaced] = useState<{
    device: string | null;
    deviceInfo: DeviceInfo | null;
    at: string;
  } | null>(null);
  const [ended, setEnded] = useState<{ reason: SessionEndedReason; at: string } | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.status !== 401) return;
      const result = await response.json().catch(() => null);
      if (result?.code === SESSION_REPLACED_CODE) {
        setReplaced({
          device: typeof result.details?.device === "string" ? result.details.device : null,
          deviceInfo: parseDeviceInfo(result.details?.deviceInfo),
          at: String(result.details?.at ?? ""),
        });
      } else if (
        result?.code === SESSION_ENDED_CODE &&
        isSessionEndedReason(result.details?.reason)
      ) {
        setEnded({ reason: result.details.reason, at: String(result.details?.at ?? "") });
      }
    } catch {
      // Offline, or the server restarting: not evidence of anything. The next
      // check will tell.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (replaced || ended) return;
    const timer = setInterval(check, SESSION_CHECK_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [check, replaced, ended]);

  async function signInAgain() {
    // Clears the cookie of a session that is already over; the server has
    // nothing left to end.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    const reason = ended ? SIGN_IN_REASON[ended.reason] : SIGN_IN_REASON.replaced;
    router.replace(`/login?reason=${reason}`);
    router.refresh();
  }

  if (ended) {
    const endedTime = formatSessionTime(ended.at);
    const byAdmin = ended.reason === "ADMIN_ENDED";
    return (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{byAdmin ? t("endedByAdminTitle") : t("passwordChangedTitle")}</DialogTitle>
            <DialogDescription>
              {byAdmin
                ? endedTime
                  ? t("endedByAdminBody", { time: endedTime })
                  : t("endedByAdminBodyNoTime")
                : endedTime
                  ? t("passwordChangedBody", { time: endedTime })
                  : t("passwordChangedBodyNoTime")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => void signInAgain()}>
              {t("signInAgain")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!replaced) return null;

  const time = formatSessionTime(replaced.at);
  const rows = deviceDetailRows(replaced.deviceInfo);
  const kindLabel = { desktop: t("kindDesktop"), phone: t("kindPhone"), tablet: t("kindTablet") };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("replacedTitle")}</DialogTitle>
          <DialogDescription>
            {time ? t("replacedBody", { time }) : t("replacedBodyNoTime")}
          </DialogDescription>
        </DialogHeader>

        {/* What took this session's place, row by row, so somebody can tell
            their own second laptop from a colleague's phone at a glance. A
            session from before the details were recorded falls back to the
            one line it has. */}
        {rows.length > 0 || replaced.device ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
            {rows.length > 0 ? (
              rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{t(row.label)}</dt>
                  <dd className="font-medium">
                    {"kind" in row
                      ? kindLabel[row.kind]
                      : row.label === "detailApp"
                        ? t("appName")
                        : row.value}
                  </dd>
                </div>
              ))
            ) : (
              <>
                <dt className="text-muted-foreground">{t("detailDevice")}</dt>
                <dd className="font-medium">{replaced.device}</dd>
              </>
            )}
            {time ? (
              <>
                <dt className="text-muted-foreground">{t("detailTime")}</dt>
                <dd className="font-medium">{time}</dd>
              </>
            ) : null}
          </dl>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={() => void signInAgain()}>
            {t("signInAgain")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
