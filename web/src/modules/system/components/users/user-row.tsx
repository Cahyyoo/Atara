"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { TableCell } from "@/core/components/ui/table";
import { AnimatedTableRow } from "@/core/components/ui/animated-table-row";
import { cn } from "@/core/lib/utils";
import { DEPARTMENT_LABEL_KEYS, personaLabelKeys } from "@/core/lib/auth/role-labels";
import type { UserDTO } from "@/modules/system/types";
import { statusOf } from "@/modules/system/components/users/user-status";
import { UserRowActions, type UserRowHandlers } from "@/modules/system/components/users/user-row-actions";
import { IoKeyOutline, IoPencilOutline, IoScanOutline, IoTimeOutline } from "react-icons/io5";

/** One account: who, which role, its state, how it signs in, since when, and what can be done. */
export function UserRow({
  user,
  index,
  currentUserId,
  handlers,
}: {
  user: UserDTO;
  index: number;
  currentUserId: string;
  handlers: UserRowHandlers;
}) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const tMfa = useTranslations("mfa.admin");
  const tDialog = useTranslations("users.dialog");
  const format = useFormatter();
  const status = statusOf(user);
  const hasFace = Boolean(user._count?.faceEnrollments);

  return (
    <AnimatedTableRow index={index}>
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
        <div className="flex flex-col items-start gap-0.5">
          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
            {tDialog(personaLabelKeys(user).name)}
          </Badge>
          {user.department ? (
            <span className="text-xs text-muted-foreground">
              {tDialog(DEPARTMENT_LABEL_KEYS[user.department])}
            </span>
          ) : null}
        </div>
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
            onClick={() => handlers.onEdit(user)}
          >
            <IoPencilOutline className="size-3.5" />
            {tCommon("edit")}
          </Button>
          <UserRowActions user={user} isSelf={user.id === currentUserId} handlers={handlers} />
        </div>
      </TableCell>
    </AnimatedTableRow>
  );
}
