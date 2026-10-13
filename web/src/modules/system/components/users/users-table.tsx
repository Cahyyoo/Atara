"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { SearchInput } from "@/core/components/form/search-input";
import { useApiList } from "@/core/hooks/use-api-list";
import type { Access } from "@/core/lib/auth/permissions";
import type { PaginationDTO } from "@/core/types";
import type { UserDTO } from "@/modules/system/types";
import { UserDialog, type UserDialogTarget } from "@/modules/system/components/users/user-dialog";
import { UserRow } from "@/modules/system/components/users/user-row";
import type { UserRowHandlers } from "@/modules/system/components/users/user-row-actions";
import { FaceEnrollDialog } from "@/modules/system/components/face/face-enroll-dialog";
import { FaceRemoveDialog } from "@/modules/system/components/face/face-remove-dialog";
import { TotpManageDialog } from "@/modules/system/components/users/totp-manage-dialog";
import { SessionsDialog } from "@/modules/system/components/users/sessions-dialog";
import { ResetPasswordDialog } from "@/modules/system/components/users/reset-password-dialog";
import { IoPersonAddOutline, IoReloadOutline } from "react-icons/io5";

type Named = { id: string; name: string };

/**
 * The accounts this manager looks after (user-scope.ts on the server): search,
 * add, edit, and the occasional actions under each row's menu. Each of those
 * opens a dialog of its own, kept here so a row stays a row.
 */
export function UsersTable({ currentUserId, manager }: { currentUserId: string; manager: Access }) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<UserDialogTarget>(null);
  const [faceTarget, setFaceTarget] = useState<Named | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Named | null>(null);
  const [totpTarget, setTotpTarget] = useState<UserDTO | null>(null);
  const [sessionsTarget, setSessionsTarget] = useState<Named | null>(null);
  const [resetTarget, setResetTarget] = useState<UserDTO | null>(null);

  const list = useApiList<UserDTO, { users: UserDTO[]; pagination: PaginationDTO }>(
    "/api/users",
    { search, pageSize: 50 },
    (result) => result.users,
    { errorMessage: tCommon("loadError") }
  );

  function handleSaved(saved: UserDTO, isNew: boolean) {
    list.setItems((users) => (isNew ? [saved, ...users] : users.map((user) => (user.id === saved.id ? saved : user))));
  }

  const handlers: UserRowHandlers = {
    onEdit: setTarget,
    onFace: setFaceTarget,
    onRemoveFace: setRemoveTarget,
    onTotp: setTotpTarget,
    onSessions: setSessionsTarget,
    onReset: setResetTarget,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} tourId="users-search" />
        <Button data-tour="users-add" className="gap-2" onClick={() => setTarget("new")}>
          <IoPersonAddOutline className="size-4" />
          {t("add")}
        </Button>
      </div>

      <InlineNotice tone="error">{list.error}</InlineNotice>

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
            {list.loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <IoReloadOutline className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((user, index) => (
                <UserRow key={user.id} user={user} index={index} currentUserId={currentUserId} handlers={handlers} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {list.pagination ? (
        <p className="text-sm text-muted-foreground">
          {tCommon("showing", { shown: list.items.length, total: list.pagination.total, noun: t("noun") })}
        </p>
      ) : null}

      <UserDialog
        target={target}
        currentUserId={currentUserId}
        manager={manager}
        onClose={() => setTarget(null)}
        onSaved={handleSaved}
      />
      {/* Refetched rather than patched in place: the enrolment count comes
          from the server, and guessing it here would show "Enrolled" for a
          save that did not land. */}
      <FaceEnrollDialog target={faceTarget} onClose={() => setFaceTarget(null)} onEnrolled={list.reload} />
      <FaceRemoveDialog target={removeTarget} onClose={() => setRemoveTarget(null)} onRemoved={list.reload} />
      <TotpManageDialog target={totpTarget} onClose={() => setTotpTarget(null)} onChanged={list.reload} />
      <SessionsDialog target={sessionsTarget} onClose={() => setSessionsTarget(null)} />
      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onReset={(saved) => handleSaved(saved, false)}
      />
    </div>
  );
}
