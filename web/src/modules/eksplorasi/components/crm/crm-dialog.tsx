"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { apiFetch, jsonBody } from "@/core/lib/http/api-client";
import { CRM_COLUMNS, type CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";
import type { CrmRowDTO } from "@/modules/eksplorasi/types";
import { IoReloadOutline } from "react-icons/io5";

/** Every field of a kind, as the form holds it: text, empty for none. */
function formOf(kind: CrmKind, row: CrmRowDTO | null): Record<string, string> {
  return Object.fromEntries(CRM_COLUMNS[kind].map((column) => [column.field, row?.[column.field] ?? ""]));
}

/**
 * Adding a row to one CRM table, or changing one: every column of that table
 * in a grid, the name first. Values go as typed -- "0.71", "<=10%" -- with
 * empty meaning none.
 */
export function CrmDialog({
  kind,
  open,
  row,
  onClose,
  onSaved,
}: {
  kind: CrmKind;
  open: boolean;
  /** The row being changed; null to add one. */
  row: CrmRowDTO | null;
  onClose: () => void;
  onSaved: (saved: CrmRowDTO) => void;
}) {
  const t = useTranslations("crmList");
  const tCommon = useTranslations("common");
  const tableName = t(`tables.${kind}.title`);
  // Read once: the caller mounts a fresh dialog (a new key) for each row it opens on.
  const [values, setValues] = useState<Record<string, string>>(() => formOf(kind, row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const body = Object.fromEntries(
      Object.entries(values).map(([field, value]) => [field, value.trim() === "" ? null : value.trim()])
    );
    const outcome = await apiFetch<CrmRowDTO>(
      row ? `/api/crm-list/${kind}/${row.id}` : `/api/crm-list/${kind}`,
      { ...jsonBody(row ? "PATCH" : "POST", body), networkError: tCommon("networkError") }
    );
    setBusy(false);

    if (!outcome.ok) {
      setError(outcome.status === 409 ? t("dialog.duplicate", { table: tableName }) : outcome.error);
      return;
    }
    onSaved(outcome.data);
  }

  const columns = CRM_COLUMNS[kind];

  return (
    <Dialog open={open} onOpenChange={(value) => (!value && !busy ? onClose() : undefined)}>
      <DialogContent className={kind === "standard" ? "sm:max-w-2xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>{t(row ? "dialog.editTitle" : "dialog.addTitle", { table: tableName })}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <form id={`crm-${kind}-form`} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className={`grid gap-3 ${kind === "standard" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
            {columns.map((column, index) => {
              return (
                // The name spans the row: it is what the rest belongs to.
                <div key={column.field} className={`flex flex-col gap-1.5 ${column.key ? "col-span-2" : ""}`}>
                  <Label htmlFor={`crm-${kind}-${column.field}`}>
                    {column.header}
                    {column.key ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  <Input
                    id={`crm-${kind}-${column.field}`}
                    autoFocus={index === 0}
                    required={column.key === true}
                    maxLength={column.maxLength}
                    autoComplete="off"
                    value={values[column.field] ?? ""}
                    onChange={(event) => {
                      const next = event.target.value;
                      setValues((previous) => ({ ...previous, [column.field]: next }));
                    }}
                  />
                </div>
              );
            })}
          </div>
          <InlineNotice tone="error">{error}</InlineNotice>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" form={`crm-${kind}-form`} disabled={busy} className="gap-2">
            {busy ? <IoReloadOutline aria-hidden className="size-4 animate-spin" /> : null}
            {busy ? t("dialog.saving") : t("dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
