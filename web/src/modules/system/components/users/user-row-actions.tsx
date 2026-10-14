"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import type { UserDTO } from "@/modules/system/types";
import {
  IoDesktopOutline,
  IoEllipsisHorizontal,
  IoKeyOutline,
  IoLockClosedOutline,
  IoScanOutline,
  IoTrashOutline,
} from "react-icons/io5";

/** What a row's menu can open, one dialog each (they live on the table). */
export interface UserRowHandlers {
  onEdit: (user: UserDTO) => void;
  onFace: (user: { id: string; name: string }) => void;
  onRemoveFace: (user: { id: string; name: string }) => void;
  onTotp: (user: UserDTO) => void;
  onSessions: (user: { id: string; name: string }) => void;
  onReset: (user: UserDTO) => void;
}

/**
 * The occasional, consequential actions on an account -- an enrolment, an
 * erasure, an authenticator reset, the sessions, a password reset -- under
 * one menu that names each of them.
 */
export function UserRowActions({
  user,
  isSelf,
  handlers,
}: {
  user: UserDTO;
  isSelf: boolean;
  handlers: UserRowHandlers;
}) {
  const t = useTranslations("users");
  const tFace = useTranslations("face");
  const tMfa = useTranslations("mfa.admin");
  const hasFace = Boolean(user._count?.faceEnrollments);

  return (
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
            onClick={() => handlers.onFace({ id: user.id, name: user.name })}
          >
            <IoScanOutline />
            {hasFace ? tFace("reEnroll") : tFace("enroll")}
          </DropdownMenuItem>
          {/* Only where there is something to remove. This
              is also the way back in for a preparator the
              camera will not recognise behind a dust mask,
              which is why it sits with the admin. */}
          {hasFace ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handlers.onRemoveFace({ id: user.id, name: user.name })}
            >
              <IoTrashOutline />
              {tFace("removeFace")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{tMfa("badgeTotp")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => handlers.onTotp(user)}>
            <IoKeyOutline />
            {tMfa("manage")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("sessions.menuLabel")}</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => handlers.onSessions({ id: user.id, name: user.name })}
          >
            <IoDesktopOutline />
            {t("sessions.menuItem")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {/* A forgotten password goes back to the role's
            default. Not for one's own account: that is
            changed with the current password. */}
        {!isSelf ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("resetDefault.menuLabel")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handlers.onReset(user)}>
                <IoLockClosedOutline />
                {t("resetDefault.menuItem")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
