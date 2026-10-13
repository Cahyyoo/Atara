"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { toast } from "@/core/components/ui/toast";
import { formatSessionTime } from "@/core/lib/auth/session-client";
import type { ApiResult } from "@/core/types";
import type { UserSessionDTO } from "@/modules/system/types";
import { IoDesktopOutline, IoPhonePortraitOutline, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

type Sessions = { active: UserSessionDTO[]; recent: UserSessionDTO[] };

/**
 * Where an account is signed in, from the admin's side, with a way to end any
 * of it: a lost phone, a laptop left signed in, somebody leaving.
 *
 * "End all" asks twice; ending one session does not, since the person only
 * has to sign in again on that device.
 */
export function SessionsDialog({
  target,
  onClose,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations("users.sessions");
  const tCommon = useTranslations("common");
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  /** Bumped after ending sessions, to read the list again. */
  const [version, setVersion] = useState(0);
  const loadError = tCommon("loadError");

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/users/${target.id}/sessions`), {
          signal: controller.signal,
        });
        const result: ApiResult<Sessions> = await response.json();
        if (!result.success) {
          setError(result.error || loadError);
          return;
        }
        setSessions(result.data);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(loadError);
      }
    })();
    return () => controller.abort();
  }, [target, version, loadError]);

  function close() {
    if (busy) return;
    setSessions(null);
    setError(null);
    setConfirmingAll(false);
    onClose();
  }

  async function end(sessionId: string | "all") {
    if (!target) return;
    setError(null);
    setBusy(sessionId);
    try {
      const url =
        sessionId === "all"
          ? `/api/users/${target.id}/sessions`
          : `/api/users/${target.id}/sessions/${sessionId}`;
      const response = await fetch(withBasePath(url), { method: "DELETE" });
      const result: ApiResult<{ ended: number }> = await response.json();
      if (!result.success) {
        setError(result.error || tCommon("networkError"));
        return;
      }
      toast(t("ended", { count: result.data.ended, name: target.name }));
      setConfirmingAll(false);
      setVersion((value) => value + 1);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(null);
    }
  }

  const endedReasonLabel = (reason: UserSessionDTO["endedReason"]) =>
    reason ? t(`reason.${reason}`) : "";

  function row(session: UserSessionDTO) {
    const Icon = session.client === "MOBILE" ? IoPhonePortraitOutline : IoDesktopOutline;
    const live = session.endedAt === null;
    return (
      <li key={session.id} className="flex items-start gap-3 py-2.5">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            {session.client === "MOBILE" ? t("mobile") : t("web")}
            {session.isCurrent ? <Badge variant="secondary">{t("thisDevice")}</Badge> : null}
          </p>
          <p className="truncate text-muted-foreground">{session.device ?? t("unknownDevice")}</p>
          <p className="text-xs text-muted-foreground">
            {t("since", { time: formatSessionTime(session.createdAt) })}
            {session.address ? ` · ${session.address}` : ""}
            {!live && session.endedAt
              ? ` · ${t("endedAt", {
                  time: formatSessionTime(session.endedAt),
                  reason: endedReasonLabel(session.endedReason),
                })}`
              : ""}
          </p>
        </div>
        {live && !session.isCurrent ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            disabled={busy !== null}
            onClick={() => void end(session.id)}
          >
            {busy === session.id ? <IoReloadOutline className="size-3.5 animate-spin" /> : null}
            {t("end")}
          </Button>
        ) : null}
      </li>
    );
  }

  const endable = sessions?.active.filter((session) => !session.isCurrent).length ?? 0;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("title", { name: target.name })}</DialogTitle>
              <DialogDescription>{t("description")}</DialogDescription>
            </DialogHeader>

            {sessions === null && !error ? (
              <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
            ) : null}

            {sessions ? (
              <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
                <section>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("activeHeading")}
                  </h3>
                  {sessions.active.length > 0 ? (
                    <ul className="divide-y">{sessions.active.map(row)}</ul>
                  ) : (
                    <p className="py-2 text-sm text-muted-foreground">{t("noneActive")}</p>
                  )}
                </section>
                {sessions.recent.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("recentHeading")}
                    </h3>
                    <ul className="divide-y">{sessions.recent.map(row)}</ul>
                  </section>
                ) : null}
              </div>
            ) : null}

            {confirmingAll ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t("endAllHint", { name: target.name })}
              </p>
            ) : null}

            <InlineNotice tone="error">{error}</InlineNotice>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={busy !== null} onClick={close}>
                {tCommon("close")}
              </Button>
              {endable > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  disabled={busy !== null}
                  onClick={() => (confirmingAll ? void end("all") : setConfirmingAll(true))}
                >
                  {busy === "all" ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                  {confirmingAll ? t("confirmEndAll") : t("endAll")}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
