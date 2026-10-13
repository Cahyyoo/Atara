"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Badge } from "@/core/components/ui/badge";
import { AnimatePresence, m } from "motion/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import type { ApiResult } from "@/core/types";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";
import { IoAdd, IoPencilOutline, IoReloadOutline, IoTrashOutline } from "react-icons/io5";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { DeleteOptionDialog } from "@/modules/lab/components/master/delete-option-dialog";
import { withBasePath } from "@/core/lib/http/base-path";
import { OptionEditor } from "@/modules/lab/components/master/option-editor";

export function KindCard({
  kind,
  options,
  onChanged,
}: {
  kind: MasterKind;
  options: MasterOptionDTO[];
  onChanged: () => void;
}) {
  const t = useTranslations("masterData");
  const tCommon = useTranslations("common");

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MasterOptionDTO | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch(withBasePath("/api/master-options"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          code,
          label: label.trim() === "" ? null : label.trim(),
          sortOrder: options.length,
        }),
      });
      const body: ApiResult<MasterOptionDTO> = await response.json();
      if (!body.success) {
        setError(body.error);
        return;
      }
      setCode("");
      setLabel("");
      onChanged();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsBusy(false);
    }
  }

  async function toggle(option: MasterOptionDTO) {
    setError(null);
    try {
      const response = await fetch(withBasePath(`/api/master-options/${option.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !option.isActive }),
      });
      const body: ApiResult<MasterOptionDTO> = await response.json();
      if (!body.success) {
        setError(body.error);
        return;
      }
      onChanged();
    } catch {
      setError(tCommon("networkError"));
    }
  }

  return (
    <Card data-tour="master-card">
      <CardHeader>
        <CardTitle className="text-base">{t(`kind.${kind}`)}</CardTitle>
        <CardDescription>{t("codeHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InlineNotice tone="error">{error}</InlineNotice>

        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {/* A real layout animation, and one of only two places in the app
                that earns one: retiring or adding a code keeps every other row
                and moves it, so there is something to follow. These are list
                items, which transform properly — the table rows elsewhere do
                not, and are left to fade. */}
            <AnimatePresence initial={false}>
            {options.map((option) =>
              editing === option.id ? (
                <OptionEditor
                  key={option.id}
                  option={option}
                  onDone={() => setEditing(null)}
                  onSaved={onChanged}
                  onError={setError}
                />
              ) : (
                <m.li
                  key={option.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                >
                  <span className="font-mono font-semibold">{option.code}</span>
                  {option.label ? (
                    <span className="truncate text-muted-foreground">{option.label}</span>
                  ) : null}
                  <Badge
                    variant={option.isActive ? "secondary" : "outline"}
                    className="ml-auto text-[10px]"
                  >
                    {option.isActive ? t("inUse") : t("retired")}
                  </Badge>
                  {/* Says why the code will be locked before the editor is even
                      opened, rather than letting it be discovered there. */}
                  {(option.usageCount ?? 0) > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t("usedBy", { count: option.usageCount ?? 0 })}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    data-tour="master-edit"
                    onClick={() => setEditing(option.id)}
                  >
                    <IoPencilOutline className="size-3.5" />
                    {tCommon("edit")}
                  </Button>
                  {/* Retiring keeps every Sample ID as it is. Deleting a code in
                      use moves its records onto another code first; the dialog
                      shows what that rewrites before anything is done. */}
                  <Button data-tour="master-retire" variant="ghost" size="sm" onClick={() => void toggle(option)}>
                    {option.isActive ? t("retire") : t("restore")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    aria-label={`${t("delete.button")} ${option.code}`}
                    title={t("delete.button")}
                    data-tour="master-delete"
                    onClick={() => setDeleting(option)}
                  >
                    <IoTrashOutline className="size-4" />
                  </Button>
                </m.li>
              )
            )}
            </AnimatePresence>
          </ul>
        )}

        <form data-tour="master-add" onSubmit={add} className="flex flex-wrap items-end gap-2 border-t pt-3">
          <Input
            aria-label={t("addCode")}
            placeholder={t("addCode")}
            className="h-9 w-24 font-mono"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Input
            aria-label={t("addLabel")}
            placeholder={t("addLabel")}
            className="h-9 w-full sm:w-44"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={isBusy}>
            {isBusy ? <IoReloadOutline aria-hidden className="size-4 animate-spin" /> : <IoAdd className="size-4" />}
            {t("add")}
          </Button>
        </form>
      </CardContent>

      <DeleteOptionDialog
        target={deleting}
        siblings={options}
        onClose={() => setDeleting(null)}
        onDeleted={onChanged}
      />
    </Card>
  );
}
