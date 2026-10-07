"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ASSAY_FIELDS, INSTRUMENT_FIELDS, type AssayField, type InstrumentField } from "@/lib/assay";
import { parseWitaInput, toWitaInputValue } from "@/lib/shift-date";
import { useMasterOptions } from "@/hooks/use-master-options";
import {
  SampleIdentityFields,
  emptyIdentity,
  identityPayload,
  type IdentityValues,
} from "@/components/database/sample-identity-fields";
import type { ApiResult, LabRecordDTO, LabRecordListItemDTO } from "@/types";
import { IoReloadOutline } from "react-icons/io5";
import { InlineNotice } from "@/components/ui/inline-notice";

type AssayInputs = Record<AssayField, string>;

function toInputs(record: LabRecordListItemDTO): AssayInputs {
  return ASSAY_FIELDS.reduce((accumulator, field) => {
    const value = record[field.key];
    accumulator[field.key] = value === null ? "" : String(value);
    return accumulator;
  }, {} as AssayInputs);
}

interface LabRecordDialogProps {
  record: LabRecordListItemDTO | null;
  onClose: () => void;
  onSaved: (record: LabRecordDTO) => void;
}

export function LabRecordDialog({ record, onClose, onSaved }: LabRecordDialogProps) {
  return (
    <Dialog
      open={record !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        {record ? (
          // Keyed by record id so opening another row starts from that row's values.
          <LabRecordForm key={record.id} record={record} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface LabRecordFormProps {
  record: LabRecordListItemDTO;
  onClose: () => void;
  onSaved: (record: LabRecordDTO) => void;
}

function LabRecordForm({ record, onClose, onSaved }: LabRecordFormProps) {
  const t = useTranslations("database.dialog");
  const tIdentity = useTranslations("database.identity");
  const tDatabase = useTranslations("database");
  const tCommon = useTranslations("common");
  const options = useMasterOptions();
  const [values, setValues] = useState<AssayInputs>(() => toInputs(record));
  const [identity, setIdentity] = useState<IdentityValues>(() => ({
    ...emptyIdentity(),
    ...(record.placeId ? { placeId: record.placeId } : {}),
    ...(record.rockTypeId ? { rockTypeId: record.rockTypeId } : {}),
    ...(record.nonProdId ? { nonProdId: record.nonProdId } : {}),
    ...(record.pitId ? { pitId: record.pitId } : {}),
    ...(record.sirId ? { sirId: record.sirId } : {}),
    bargingNo: record.bargingNo ?? "",
    sequenceNo: record.sequenceNo?.toString() ?? "",
    sampleNo: record.sampleNo?.toString() ?? "",
    sackCount: record.sackCount?.toString() ?? "",
  }));
  const [instrument, setInstrument] = useState<Record<InstrumentField, string>>(() => {
    const values = {} as Record<InstrumentField, string>;
    for (const field of INSTRUMENT_FIELDS) {
      const value = record[field.key];
      // A datetime-local box holds a wall clock with no timezone, so the
      // stored instant is rendered on the lab's clock rather than handed
      // over raw for the browser to read in its own zone.
      values[field.key] =
        value == null ? "" : field.kind === "datetime" ? toWitaInputValue(value) : String(value);
    }
    return values;
  });
  const [remarks, setRemarks] = useState(record.remarks ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // A blank input clears the column instead of being stored as zero.
      const payload: Record<string, number | string | null> = {
        remarks: remarks.trim() || null,
        // A sub-sample's identity is its parent's and changes there.
        ...(record?.parentId ? {} : identityPayload(identity)),
      };
      for (const field of INSTRUMENT_FIELDS) {
        const raw = instrument[field.key].trim();
        // Blank means "not recorded", which has to clear the column rather
        // than store "" or, for the date, the Epoch.
        payload[field.key] =
          raw === ""
            ? null
            : field.kind === "datetime"
              ? (parseWitaInput(raw)?.toISOString() ?? null)
              : raw;
      }
      for (const field of ASSAY_FIELDS) {
        const raw = values[field.key].trim();
        payload[field.key] = raw === "" ? null : Number(raw);
      }

      const response = await fetch(`/api/lab-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: ApiResult<LabRecordDTO> = await response.json();

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved(result.data);
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
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>
          {record.labCode} · {record.sample.sampleCode}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
        {/* The identity form plus eighteen assay inputs is taller than a laptop
            screen, and a dialog centred on the viewport loses its top and its
            bottom at once when that happens — the Save button with it. Only the
            fields scroll; the title and the footer stay where they are.
            The padding is there so a focus ring at the edge is not clipped. */}
        <div className="-mx-1 grid min-h-0 gap-4 overflow-y-auto px-1 lg:grid-cols-2">
          {/* Identity and remarks down one side, the assay results down the
              other. Stacked below lg, where two columns of two columns would
              leave nothing but slivers. */}
          <div className="flex flex-col gap-4">
            {/* The frame and the heading belong to the section, not to the
                fields: on a generate the same fields sit inside a numbered
                block that already says which barcode they are. */}
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <p className="text-sm font-medium">{tIdentity("title")}</p>
              {record?.parentId ? (
                <p className="text-sm text-muted-foreground">{tIdentity("followsParent")}</p>
              ) : (
                <SampleIdentityFields
                  values={identity}
                  onChange={setIdentity}
                  options={options}
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assay-remarks">{t("remarks")}</Label>
              <Textarea
                id="assay-remarks"
                rows={3}
                maxLength={1000}
                placeholder={t("remarksPlaceholder")}
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
              />
            </div>

            {/* What the instrument reported alongside the numbers. Editable
                here for the same reason every other column is: this dialog
                is where one record gets corrected. */}
            {INSTRUMENT_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`assay-${field.key}`}>{tDatabase(field.key)}</Label>
                <Input
                  id={`assay-${field.key}`}
                  type={field.kind === "datetime" ? "datetime-local" : "text"}
                  placeholder="—"
                  value={instrument[field.key]}
                  onChange={(event) =>
                    setInstrument((previous) => ({
                      ...previous,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="grid h-fit grid-cols-2 gap-3">
            {ASSAY_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`assay-${field.key}`}>{field.label}</Label>
                <Input
                  id={`assay-${field.key}`}
                  type="number"
                  step="0.001"
                  min={0}
                  max={field.max}
                  placeholder="—"
                  value={values[field.key]}
                  onChange={(event) =>
                    setValues((previous) => ({ ...previous, [field.key]: event.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Outside the scroller, so a failed save is never something you have to
            go looking for. */}
        <InlineNotice tone="error">{error}</InlineNotice>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" className="gap-2" disabled={isSubmitting}>
            {isSubmitting ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
