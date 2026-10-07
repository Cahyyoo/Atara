"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatedTableRow } from "@/components/ui/animated-table-row";
import { UserDialog, type UserDialogTarget } from "@/components/users/user-dialog";
import type { ApiResult, PaginationDTO, UserDTO } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ROLE_LABEL_KEYS } from "@/lib/role-labels";
import {
  IoEllipsisHorizontal,
  IoDesktopOutline,
  IoKeyOutline,
  IoLockClosedOutline,
  IoPencilOutline,
  IoPersonAddOutline,
  IoReloadOutline,
  IoScanOutline,
  IoSearchOutline,
  IoTimeOutline,
  IoTrashOutline,
} from "react-icons/io5";
import { FaceEnrollDialog } from "@/components/face/face-enroll-dialog";
import { FaceRemoveDialog } from "@/components/face/face-remove-dialog";
import { TotpManageDialog } from "@/components/users/totp-manage-dialog";
import { SessionsDialog } from "@/components/users/sessions-dialog";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { InlineNotice } from "@/components/ui/inline-notice";

export function isLockedOut(user: UserDTO): boolean {
  return user.lockedUntil !== null && new Date(user.lockedUntil) > new Date();
}

/**
 * How an account's state reads at a glance.
 *
 * Deactivated is deliberately grey, not red: it is a state an admin chose,
 * not something going wrong, and painting it like an error made every
 * retired account shout. Locked is the one that stays red, because it is the
 * one that wants something done about it (the unlock is in Edit).
 */
function statusOf(user: UserDTO): {
  key: "statusDeactivated" | "statusLocked" | "statusActive";
  className: string;
  dot: string;
} {
  if (!user.isActive) {
    return { key: "statusDeactivated", className: "text-muted-foreground", dot: "bg-muted-foreground/50" };
  }
  if (isLockedOut(user)) {
    return { key: "statusLocked", className: "font-medium text-destructive", dot: "bg-destructive" };
  }
  return { key: "statusActive", className: "text-foreground", dot: "bg-primary" };
}

export function UsersTable({ currentUserId }: { currentUserId: string }) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const tFace = useTranslations("face");
  const tMfa = useTranslations("mfa.admin");
  const tDialog = useTranslations("users.dialog");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [pagination, setPagination] = useState<PaginationDTO | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<UserDialogTarget>(null);
  const [faceTarget, setFaceTarget] = useState<{ id: string; name: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [totpTarget, setTotpTarget] = useState<UserDTO | null>(null);
  const [sessionsTarget, setSessionsTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<UserDTO | null>(null);

  const fetchUsers = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        params.set("pageSize", "50");

        const response = await fetch(`/api/users?${params.toString()}`, { signal });
        const result: ApiResult<{ users: UserDTO[]; pagination: PaginationDTO }> =
          await response.json();

        if (!result.success) {
          setError(result.error);
          return;
        }
        setUsers(result.data.users);
        setPagination(result.data.pagination);
      } catch (error) {
        // An aborted request is a superseded one; leave the state alone.
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(loadError);
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [search, loadError]
  );

  useEffect(() => {
    // Aborting matters as much for correctness as for cost: without it a slow
    // response for an earlier search term can land after a newer one.
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchUsers(controller.signal);
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [fetchUsers]);

  function handleSaved(saved: UserDTO, isNew: boolean) {
    setUsers((previous) =>
      isNew ? [saved, ...previous] : previous.map((user) => (user.id === saved.id ? saved : user))
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("searchPlaceholder")}
            data-tour="users-search"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
          />
        </div>
        <Button data-tour="users-add" className="gap-2" onClick={() => setTarget("new")}>
          <IoPersonAddOutline className="size-4" />
          {t("add")}
        </Button>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("user")}</TableHead>
              <TableHead>{t("role")}</TableHead>
              <TableHead>{tCommon("status")}</TableHead>
              <TableHead data-tour="users-verification">{t("verification")}</TableHead>
              <TableHead>{t("created")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <IoReloadOutline className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user, rowIndex) => {
                const status = statusOf(user);
                const hasFace = Boolean(user._count?.faceEnrollments);
                return (
                  <AnimatedTableRow key={user.id} index={rowIndex}>
                    {/* Name and email as one cell: the email identifies the
                        person, it is not something anybody compares down a
                        column, and its own column was the width the actions
                        needed. */}
                    <TableCell className="max-w-64">
                      <div className="flex flex-col">
                        <span
                          className={cn(
                            "truncate font-medium",
                            !user.isActive && "text-muted-foreground"
                          )}
                        >
                          {user.name}
                          {user.id === currentUserId ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {t("you")}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                        {tDialog(ROLE_LABEL_KEYS[user.role].name)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 whitespace-nowrap text-sm",
                          status.className
                        )}
                      >
                        <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
                        {t(status.key)}
                      </span>
                      {/* Still on the password an administrator gave them. */}
                      {user.mustChangePassword ? (
                        <Badge variant="outline" className="ml-2" title={t("mustChangeHint")}>
                          {t("mustChange")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    {/* Every second factor the account has, side by side on
                        one line: which one somebody signs in with is theirs to
                        choose, so the admin needs to see all of them at once --
                        without this row growing taller than its neighbours. */}
                    <TableCell>
                      {hasFace || user.totpEnabledAt || user.totpRequestedAt ? (
                        <div className="flex flex-nowrap gap-1">
                          {hasFace ? (
                            <Badge variant="secondary">
                              <IoScanOutline aria-hidden />
                              {tMfa("badgeFace")}
                            </Badge>
                          ) : null}
                          {user.totpEnabledAt ? (
                            <Badge variant="secondary">
                              <IoKeyOutline aria-hidden />
                              {tMfa("badgeTotp")}
                            </Badge>
                          ) : user.totpRequestedAt ? (
                            <Badge variant="outline" title={tMfa("pendingHint")}>
                              <IoTimeOutline aria-hidden />
                              {tMfa("badgePending")}
                            </Badge>
                          ) : null}
                        </div>
                      ) : (
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                          {tMfa("none")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format.dateTime(new Date(user.createdAt), { dateStyle: "medium" })}
                    </TableCell>
                    {/*
                      Always the same two controls, so every row lines up.

                      Editing is what this page is mostly for, so it stays a
                      button. The second factors are occasional and
                      consequential -- an enrolment, an erasure, an
                      authenticator reset -- so they sit one click further in,
                      under a menu that names each of them, instead of a row of
                      look-alike buttons whose number changed from one account
                      to the next.
                    */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          data-tour="users-edit"
                          onClick={() => setTarget(user)}
                        >
                          <IoPencilOutline className="size-3.5" />
                          {tCommon("edit")}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="outline"
                                size="icon-sm"
                                aria-label={t("moreActions", { name: user.name })}
                                data-tour="users-more"
                              >
                                <IoEllipsisHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>{tMfa("badgeFace")}</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setFaceTarget({ id: user.id, name: user.name })}
                              >
                                <IoScanOutline />
                                {hasFace ? tFace("reEnroll") : tFace("enroll")}
                              </DropdownMenuItem>
                              {/* Only where there is something to remove. This
                                  is also the way back in for an operator the
                                  camera will not recognise behind a dust mask,
                                  which is why it sits with the admin. */}
                              {hasFace ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setRemoveTarget({ id: user.id, name: user.name })}
                                >
                                  <IoTrashOutline />
                                  {tFace("removeFace")}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>{tMfa("badgeTotp")}</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setTotpTarget(user)}>
                                <IoKeyOutline />
                                {tMfa("manage")}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>{t("sessions.menuLabel")}</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setSessionsTarget({ id: user.id, name: user.name })}
                              >
                                <IoDesktopOutline />
                                {t("sessions.menuItem")}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                            {/* A forgotten password goes back to the role's
                                default. Not for one's own account: that is
                                changed with the current password. */}
                            {user.id !== currentUserId ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel>{t("resetDefault.menuLabel")}</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => setResetTarget(user)}>
                                    <IoLockClosedOutline />
                                    {t("resetDefault.menuItem")}
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </AnimatedTableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <p className="text-sm text-muted-foreground">
          {tCommon("showing", { shown: users.length, total: pagination.total, noun: t("noun") })}
        </p>
      ) : null}

      <UserDialog
        target={target}
        currentUserId={currentUserId}
        onClose={() => setTarget(null)}
        onSaved={handleSaved}
      />

      <FaceEnrollDialog
        target={faceTarget}
        onClose={() => setFaceTarget(null)}
        // Refetched rather than patched in place: the enrolment count comes
        // from the server, and guessing it here would show "Enrolled" for a
        // save that did not land.
        onEnrolled={() => void fetchUsers()}
      />

      <FaceRemoveDialog
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => void fetchUsers()}
      />

      <TotpManageDialog
        target={totpTarget}
        onClose={() => setTotpTarget(null)}
        onChanged={() => void fetchUsers()}
      />

      <SessionsDialog target={sessionsTarget} onClose={() => setSessionsTarget(null)} />

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={(saved) => handleSaved(saved, false)}
      />
    </div>
  );
}
