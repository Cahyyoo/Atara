"use client";

import { memo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { cn } from "@/core/lib/utils";
import { IoArrowUndoOutline } from "react-icons/io5";
import { MasterCombobox } from "@/modules/lab/components/shared/master-combobox";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";
import {
  NONE,
  fieldStatus,
  type FieldKey,
  type Status,
} from "@/modules/lab/components/database/bulk-identity/identity-plan";

export interface FieldProps {
  index: number;
  fieldKey: FieldKey;
  label: string;
  value: string;
  start: string;
  mixed: boolean;
  onSet: (fieldKey: FieldKey, value: string) => void;
}

/**
 * A field with its label, and -- on the same line, so nothing below moves
 * when it appears -- what is about to happen to it and an Undo.
 */
export function FieldFrame({
  index,
  fieldKey,
  label,
  status,
  onRevert,
  children,
}: {
  index: number;
  fieldKey: FieldKey;
  label: string;
  status: Status;
  onRevert: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("database.bulkIdentity");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center gap-2">
        <Label htmlFor={`bulk-ident-${index}-${fieldKey}`} className="min-w-0 truncate">
          {label}
        </Label>
        {status !== "keep" ? (
          <span className="ml-auto flex shrink-0 animate-in items-center gap-1 duration-150 fade-in-0">
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] leading-4 font-medium",
                status === "set" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              )}
            >
              {status === "set" ? t("changed") : status === "clear" ? t("cleared") : t("invalidNumber")}
            </span>
            <button
              type="button"
              onClick={onRevert}
              aria-label={t("revert")}
              title={t("revert")}
              className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IoArrowUndoOutline aria-hidden className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** The changed field's outline, eased in rather than switched on. */
export function ringFor(status: Status) {
  const ease = "transition-[color,background-color,border-color,box-shadow] duration-150";
  if (status === "keep") return ease;
  return cn(ease, status === "set" ? "ring-2 ring-primary/40" : "ring-2 ring-destructive/40");
}

export const PickerField = memo(function PickerField({
  index,
  fieldKey,
  label,
  value,
  start,
  mixed,
  items,
  kind,
  options,
  canCreate,
  onSet,
}: FieldProps & {
  items: Record<string, string>;
  kind: MasterKind;
  options: readonly MasterOptionDTO[];
  /** Whether a code missing from the list may be added from here. */
  canCreate: boolean;
}) {
  const status = fieldStatus(fieldKey, value, start, mixed);
  return (
    <FieldFrame index={index} fieldKey={fieldKey} label={label} status={status} onRevert={() => onSet(fieldKey, start)}>
      <MasterCombobox
        id={`bulk-ident-${index}-${fieldKey}`}
        kind={kind}
        value={value}
        items={items}
        options={options}
        canCreate={canCreate}
        onValueChange={(next) => onSet(fieldKey, next || NONE)}
        className={ringFor(status)}
      />
    </FieldFrame>
  );
});

export const TextField = memo(function TextField({
  index,
  fieldKey,
  label,
  numeric,
  value,
  start,
  mixed,
  onSet,
  sequential,
  onSequential,
}: FieldProps & {
  numeric: boolean;
  /** Only on the sample number of a form for several records. */
  sequential?: boolean;
  onSequential: (sequential: boolean) => void;
}) {
  const t = useTranslations("database.bulkIdentity");
  const status = fieldStatus(fieldKey, value, start, mixed);
  const mode = numeric ? "numeric" : undefined;
  const placeholder = mixed ? t("mixedPlaceholder") : undefined;
  return (
    <FieldFrame index={index} fieldKey={fieldKey} label={label} status={status} onRevert={() => onSet(fieldKey, start)}>
      <Input
        id={`bulk-ident-${index}-${fieldKey}`}
        inputMode={mode}
        placeholder={placeholder}
        aria-invalid={status === "invalid"}
        className={ringFor(status)}
        value={value}
        onChange={(event) => onSet(fieldKey, event.target.value)}
      />
      {/* Sample numbers differ from record to record by nature: one typed for
          several records is where the numbering starts. */}
      {sequential !== undefined ? (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 accent-primary"
            checked={sequential}
            onChange={(event) => onSequential(event.target.checked)}
          />
          {t("numberSequentially")}
        </label>
      ) : null}
    </FieldFrame>
  );
});
