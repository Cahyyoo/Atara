"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { DRILL_HOLE_STATUSES } from "@/lib/drill-hole";
import { withBasePath } from "@/lib/base-path";
import type { ApiResult, DrillHoleDTO, DrillHoleStatus } from "@/types";
import { IoReloadOutline } from "react-icons/io5";

/** `null` closes the dialog; "new" opens it in create mode. */
export type DrillHoleDialogTarget = DrillHoleDTO | "new" | null;

const NUMBER_FIELDS = ["easting", "northing", "elevation", "azimuth", "dip", "totalDepth"] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

/** What each number field accepts, matching the server's schema. */
const NUMBER_INPUT: Record<NumberField, { step: string; min?: number; max?: number }> = {
  easting: { step: "0.001" },
  northing: { step: "0.001" },
  elevation: { step: "0.01" },
  azimuth: { step: "0.01", min: 0, max: 360 },
  dip: { step: "0.01", min: -90, max: 90 },
  totalDepth: { step: "0.01", min: 0 },
};

interface DrillHoleDialogProps {
  target: DrillHoleDialogTarget;
  onClose: () => void;
  onSaved: (row: DrillHoleDTO, isNew: boolean) => void;
}

export function DrillHoleDialog({ target, onClose, onSaved }: DrillHoleDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {target ? (
          // Keyed so switching rows resets the form to that hole's values.
          <DrillHoleForm
            key={target === "new" ? "new" : target.id}
            target={target}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DrillHoleForm({
  target,
  onClose,
  onSaved,
}: {
  target: DrillHoleDTO | "new";
  onClose: () => void;
  onSaved: (row: DrillHoleDTO, isNew: boolean) => void;
}) {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const isNew = target === "new";
  const row = isNew ? null : target;

  const [holeId, setHoleId] = useState(row?.holeId ?? "");
  const [area, setArea] = useState(row?.area ?? "");
  const [status, setStatus] = useState<DrillHoleStatus>(row?.status ?? "PLANNED");
  const [numbers, setNumbers] = useState<Record<NumberField, string>>(
    () =>
      Object.fromEntries(
        NUMBER_FIELDS.map((field) => [field, row?.[field] === null || !row ? "" : String(row[field])])
      ) as Record<NumberField, string>
  );
  const [startDate, setStartDate] = useState(row?.startDate ?? "");
  const [endDate, setEndDate] = useState(row?.endDate ?? "");
  const [remarks, setRemarks] = useState(row?.remarks ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (startDate && endDate && endDate < startDate) {
      setError(t("errors.dateOrder"));
      return;
    }

    setIsSubmitting(true);
    try {
      // An empty field is sent as null, which clears the column.
      const body = {
        holeId,
        area: area.trim() || null,
        status,
        ...Object.fromEntries(
          NUMBER_FIELDS.map((field) => [field, numbers[field].trim() === "" ? null : Number(numbers[field])])
        ),
        startDate: startDate || null,
        endDate: endDate || null,
        remarks: remarks.trim() || null,
      };

      const response = await fetch(withBasePath(isNew ? "/api/drill-holes" : `/api/drill-holes/${row!.id}`), {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: ApiResult<DrillHoleDTO> = await response.json();

      if (!result.success) {
        setError(response.status === 409 ? t("errors.duplicate", { holeId }) : result.error);
        return;
      }

      toast(isNew ? t("created", { holeId: result.data.holeId }) : t("updated", { holeId: result.data.holeId }));
      onSaved(result.data, isNew);
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? t("addTitle") : t("editTitle", { holeId: row!.holeId })}</DialogTitle>
        <DialogDescription>{t("dialogDescription")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drill-hole-id">{t("fields.holeId")}</Label>
            <Input
              id="drill-hole-id"
              required
              maxLength={50}
              placeholder={t("placeholders.holeId")}
              value={holeId}
              onChange={(event) => setHoleId(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drill-area">{t("fields.area")}</Label>
            <Input
              id="drill-area"
              maxLength={100}
              placeholder={t("placeholders.area")}
              value={area}
              onChange={(event) => setArea(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drill-status">{t("fields.status")}</Label>
            <Select
              value={status}
              items={Object.fromEntries(DRILL_HOLE_STATUSES.map((value) => [value, t(`status.${value}`)]))}
              onValueChange={(value) => setStatus(value as DrillHoleStatus)}
            >
              <SelectTrigger id="drill-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRILL_HOLE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`status.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <fieldset className="grid grid-cols-1 gap-4 rounded-lg border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{t("sections.collar")}</legend>
          {(["easting", "northing", "elevation"] as const).map((field) => (
            <NumberInput key={field} field={field} value={numbers[field]} onChange={setNumbers} />
          ))}
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 rounded-lg border p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{t("sections.survey")}</legend>
          {(["azimuth", "dip", "totalDepth"] as const).map((field) => (
            <NumberInput key={field} field={field} value={numbers[field]} onChange={setNumbers} />
          ))}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drill-start">{t("fields.startDate")}</Label>
            <Input
              id="drill-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drill-end">{t("fields.endDate")}</Label>
            <Input
              id="drill-end"
              type="date"
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="drill-remarks">{t("fields.remarks")}</Label>
          <Textarea
            id="drill-remarks"
            rows={3}
            maxLength={5000}
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </div>

        <InlineNotice tone="error">{error}</InlineNotice>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" className="gap-2" disabled={isSubmitting}>
            {isSubmitting ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {isNew ? t("create") : tCommon("save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: NumberField;
  value: string;
  onChange: (update: (previous: Record<NumberField, string>) => Record<NumberField, string>) => void;
}) {
  const t = useTranslations("drilling");
  const { step, min, max } = NUMBER_INPUT[field];

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`drill-${field}`}>{t(`fields.${field}`)}</Label>
      <Input
        id={`drill-${field}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange((previous) => ({ ...previous, [field]: event.target.value }))}
      />
    </div>
  );
}
