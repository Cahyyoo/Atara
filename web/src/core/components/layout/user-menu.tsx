"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { setLocale } from "@/app/actions/locale";
import { setTheme } from "@/app/actions/theme";
import { LOCALES, LOCALE_LABELS } from "@/core/i18n/config";
import { THEMES } from "@/core/lib/ui/theme";
import { useTheme } from "@/core/components/layout/theme-provider";
import type { SessionPayload } from "@/core/lib/auth/auth";
import { personaLabelKeys } from "@/core/lib/auth/role-labels";
import { ChangePasswordDialog } from "@/core/components/layout/change-password-dialog";
import {
  IoChevronDown,
  IoContrastOutline,
  IoHelpCircleOutline,
  IoKeyOutline,
  IoLanguageOutline,
  IoLogOutOutline,
  IoReloadOutline,
} from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";
import { initialsOf } from "@/core/lib/ui/initials";


export function UserMenu({ user }: { user: SessionPayload }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("users.dialog");
  const locale = useLocale();
  const theme = useTheme();
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="h-auto gap-2 py-1.5 pl-1.5 pr-2" data-tour="user-menu" />
          }
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
          >
            {initialsOf(user.name)}
          </span>
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
            {user.name}
          </span>
          <IoChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <Badge
              variant={user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? "default" : "secondary"}
              className="mt-1.5 text-[10px]"
            >
              {tRoles(personaLabelKeys(user).name)}
            </Badge>
          </div>

          <DropdownMenuSeparator />

          {/* Radio items rather than a Select: a popup inside a popup is awkward.
              The label has to live inside the group, which owns its context. */}
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => {
              if (!value || value === locale) return;
              // The locale lives in a cookie read on the server, so the tree
              // has to be refetched for the change to show.
              startTransition(async () => {
                await setLocale(value);
                router.refresh();
              });
            }}
          >
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <IoLanguageOutline aria-hidden className="size-3.5" />
              {t("language")}
            </DropdownMenuLabel>
            {LOCALES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value} disabled={isPending}>
                {LOCALE_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          {/* Same shape as the language group directly above, and for the same
              reason: both are preferences kept in a cookie and read on the
              server, so both need the tree refetched before they show. */}
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              if (!value || value === theme) return;
              startTransition(async () => {
                await setTheme(value);
                router.refresh();
              });
            }}
          >
            <DropdownMenuLabel className="flex items-center gap-1.5">
              <IoContrastOutline aria-hidden className="size-3.5" />
              {t("appearance")}
            </DropdownMenuLabel>
            {THEMES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value} disabled={isPending}>
                {value === "light" ? t("themeLight") : t("themeDark")}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => router.push("/help")}>
            <IoHelpCircleOutline className="size-4" />
            {t("help")}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setIsChangingPassword(true)}>
            <IoKeyOutline className="size-4" />
            {t("changePassword")}
          </DropdownMenuItem>

          <DropdownMenuItem variant="destructive" onClick={() => setIsConfirmingLogout(true)}>
            <IoLogOutOutline className="size-4" />
            {t("logOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isConfirmingLogout}
        onOpenChange={(open) => {
          if (!open && !isLoggingOut) setIsConfirmingLogout(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("logOutTitle")}</DialogTitle>
            <DialogDescription>{t("logOutBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isLoggingOut}
              onClick={() => setIsConfirmingLogout(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={isLoggingOut}
              onClick={handleLogout}
            >
              {isLoggingOut ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {t("logOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog
        open={isChangingPassword}
        onClose={() => setIsChangingPassword(false)}
      />
    </>
  );
}
