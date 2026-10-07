"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ROLES, type Role } from "@/lib/permissions";
import { ROLE_LABEL_KEYS } from "@/lib/role-labels";
import { SHIFT_TIMEZONE_OFFSET_MINUTES, formatWitaDateTime } from "@/lib/shift-date";
import type { AnnouncementDTO, ApiResult } from "@/types";
import { IoInformationCircleOutline, IoReloadOutline, IoWarningOutline } from "react-icons/io5";

const OFFSET_MS = SHIFT_TIMEZONE_OFFSET_MINUTES * 60_000;

/** An instant as the WITA wall clock a datetime-local input shows. */
export function toWitaInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

/** A datetime-local value, read as WITA, back to an instant. */
export function fromWitaInput(value: string): string | null {
  if (!value) return null;
  const asUtc = new Date(`${value}:00.000Z`);
  return Number.isNaN(asUtc.getTime()) ? null : new Date(asUtc.getTime() - OFFSET_MS).toISOString();
}

type Status = "active" | "scheduled" | "ended";

function statusOf(announcement: AnnouncementDTO, now: number): Status {
  if (announcement.endsAt && new Date(announcement.endsAt).getTime() <= now) return "ended";
  if (new Date(announcement.startsAt).getTime() > now) return "scheduled";
  return "active";
}

interface Draft {
  message: string;
  tone: "INFO" | "WARNING";
  roles: Role[];
  startsAt: string;
  endsAt: string;
}

const EMPTY: Draft = { message: "", tone: "INFO", roles: [], startsAt: "", endsAt: "" };

/**
 * Writing, scheduling and taking down the banners every page shows. Empty
 * roles mean everybody; no start means now; no end means until ended here.
 */
export function AnnouncementsManager() {
  const t = useTranslations("announcements");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("users.dialog");
  const [list, setList] = useState<AnnouncementDTO[] | null>(null);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When the list was read, which is what "showing" or "ended" is judged against. */
  const [now, setNow] = useState(() => Date.now());
  const loadError = tCommon("loadError");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/announcements", { signal: controller.signal });
        const body: ApiResult<{ announcements: AnnouncementDTO[] }> = await response.json();
        if (body.success) {
          setList(body.data.announcements);
          setNow(Date.now());
        }
        else setError(body.error);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(loadError);
      }
    })();
    return () => controller.abort();
  }, [version, loadError]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result: ApiResult<unknown> = await response.json();
      if (!result.success) {
        setError(result.error || tCommon("networkError"));
        return false;
      }
      setVersion((value) => value + 1);
      return true;
    } catch {
      setError(tCommon("networkError"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      message: draft.message,
      tone: draft.tone,
      roles: draft.roles.length > 0 ? draft.roles : null,
      ...(draft.startsAt ? { startsAt: fromWitaInput(draft.startsAt) } : {}),
      endsAt: fromWitaInput(draft.endsAt),
    };
    const ok = editing
      ? await send(`/api/announcements/${editing}`, "PATCH", payload)
      : await send("/api/announcements", "POST", payload);
    if (ok) {
      toast(editing ? t("saved") : t("created"));
      setDraft(EMPTY);
      setEditing(null);
    }
  }

  function edit(announcement: AnnouncementDTO) {
    setEditing(announcement.id);
    setError(null);
    setDraft({
      message: announcement.message,
      tone: announcement.tone,
      roles: announcement.roles ?? [],
      startsAt: toWitaInput(announcement.startsAt),
      endsAt: toWitaInput(announcement.endsAt),
    });
  }

  const roleName = (role: Role) => tRoles(ROLE_LABEL_KEYS[role].name);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="announcement-message">{t("message")}</Label>
            <Textarea
              id="announcement-message"
              data-tour="admin-message"
              rows={2}
              maxLength={500}
              required
              placeholder={t("messagePlaceholder")}
              value={draft.message}
              onChange={(event) => setDraft({ ...draft, message: event.target.value })}
            />
          </div>

          <div data-tour="admin-audience" className="flex flex-wrap gap-x-6 gap-y-3">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t("tone")}</legend>
              <div className="flex gap-2">
                {(["INFO", "WARNING"] as const).map((tone) => (
                  <Button
                    key={tone}
                    type="button"
                    size="sm"
                    variant={draft.tone === tone ? "default" : "outline"}
                    aria-pressed={draft.tone === tone}
                    onClick={() => setDraft({ ...draft, tone })}
                  >
                    {t(`tones.${tone}`)}
                  </Button>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t("roles")}</legend>
              <div className="flex flex-wrap gap-3">
                {ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={draft.roles.includes(role)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          roles: event.target.checked
                            ? [...draft.roles, role]
                            : draft.roles.filter((held) => held !== role),
                        })
                      }
                    />
                    {roleName(role)}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("rolesHint")}</p>
            </fieldset>
          </div>

          <div data-tour="admin-times" className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="announcement-start">{t("startsAt")}</Label>
              <Input
                id="announcement-start"
                type="datetime-local"
                className="w-56"
                value={draft.startsAt}
                onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="announcement-end">{t("endsAt")}</Label>
              <Input
                id="announcement-end"
                type="datetime-local"
                className="w-56"
                value={draft.endsAt}
                onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("timesHint")}</p>

          <InlineNotice tone="error">{error}</InlineNotice>

          <div className="flex gap-2">
            <Button data-tour="admin-publish" type="submit" className="gap-2" disabled={busy || draft.message.trim() === ""}>
              {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {editing ? t("save") : t("publish")}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDraft(EMPTY);
                }}
              >
                {tCommon("cancel")}
              </Button>
            ) : null}
          </div>
        </form>

        {list === null ? (
          <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
        ) : list.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((announcement) => {
              const status = statusOf(announcement, now);
              const Icon = announcement.tone === "WARNING" ? IoWarningOutline : IoInformationCircleOutline;
              return (
                <li
                  key={announcement.id}
                  className={cn("flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-start", status === "ended" && "opacity-60")}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      announcement.tone === "WARNING" ? "text-amber-600" : "text-primary"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line text-sm">{announcement.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant={status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {t(`status.${status}`)}
                      </Badge>
                      <span>
                        {announcement.roles
                          ? announcement.roles.map(roleName).join(", ")
                          : t("everyone")}
                      </span>
                      <span>·</span>
                      <span>
                        {t("window", {
                          start: formatWitaDateTime(announcement.startsAt)?.slice(0, 16) ?? "",
                          end: announcement.endsAt
                            ? (formatWitaDateTime(announcement.endsAt)?.slice(0, 16) ?? "")
                            : t("untilEnded"),
                        })}
                      </span>
                      {announcement.createdBy ? <span>· {announcement.createdBy}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => edit(announcement)}>
                      {tCommon("edit")}
                    </Button>
                    {status !== "ended" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void send(`/api/announcements/${announcement.id}`, "PATCH", { end: true }).then(
                            (ok) => ok && toast(t("ended"))
                          )
                        }
                      >
                        {t("endNow")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() =>
                        void send(`/api/announcements/${announcement.id}`, "DELETE").then(
                          (ok) => ok && toast(t("deleted"))
                        )
                      }
                    >
                      {t("delete")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
