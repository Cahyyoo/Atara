"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { MasterCombobox } from "@/modules/lab/components/shared/master-combobox";
import { composeSampleIdent } from "@/modules/lab/lib/samples/sample-ident";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";

/** The identity a Sample ID is built from, as the form holds it. */
export interface IdentityValues {
  placeId: string;
  rockTypeId: string;
  nonProdId: string;
  pitId: string;
  sirId: string;
  bargingNo: string;
  sequenceNo: string;
  sampleNo: string;
  sackCount: string;
}

const NONE = "NONE";

const PICKERS: { field: keyof IdentityValues; kind: MasterKind; optional?: boolean }[] = [
  { field: "placeId", kind: "PLACE" },
  { field: "rockTypeId", kind: "ROCK_TYPE" },
  // The only optional one: an ordinary production sample has no such code, and
  // its segment simply is not in the id.
  { field: "nonProdId", kind: "NON_PROD", optional: true },
  { field: "sirId", kind: "SIR" },
  { field: "pitId", kind: "PIT" },
];

const NUMBERS: { field: keyof IdentityValues; max: number }[] = [
  { field: "bargingNo", max: 999999 },
  { field: "sequenceNo", max: 999999 },
  { field: "sampleNo", max: 999999 },
  { field: "sackCount", max: 99999 },
];

export function emptyIdentity(): IdentityValues {
  return {
    placeId: NONE,
    rockTypeId: NONE,
    nonProdId: NONE,
    pitId: NONE,
    sirId: NONE,
    bargingNo: "",
    sequenceNo: "",
    sampleNo: "",
    sackCount: "",
  };
}

function number(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Turns what the form holds into what the API takes. */
export function identityPayload(values: IdentityValues) {
  const option = (value: string) => (value === NONE ? null : value);

  return {
    placeId: option(values.placeId),
    rockTypeId: option(values.rockTypeId),
    nonProdId: option(values.nonProdId),
    pitId: option(values.pitId),
    sirId: option(values.sirId),
    bargingNo: values.bargingNo.trim() || null,
    sequenceNo: number(values.sequenceNo),
    sampleNo: number(values.sampleNo),
    sackCount: number(values.sackCount),
  };
}

/**
 * The identity for the barcode after this one.
 *
 * A run of samples off one pit differs in the sample number and nothing else,
 * so a new block starts as a copy of the last with that number advanced. This
 * is what the old running-number rule did on the server, moved to where the
 * operator can see it and change it.
 *
 * A blank sample number stays blank: inventing a 1 would put a Sample ID on a
 * barcode nobody has identified yet, which is the one thing that rule was
 * careful never to do.
 */
export function nextIdentity(values: IdentityValues, step = 1): IdentityValues {
  const current = number(values.sampleNo);

  return {
    ...values,
    sampleNo: current === null ? "" : String(current + step),
  };
}

/**
 * The Sample ID this block would store, or null while too little is known.
 *
 * The same function the server composes with, so what is previewed is what
 * gets stored — not a second implementation that can drift from it.
 */
export function composeIdentity(
  values: IdentityValues,
  options: MasterOptionDTO[]
): string | null {
  const codeOf = (id: string) =>
    id === NONE ? null : (options.find((option) => option.id === id)?.code ?? null);

  return composeSampleIdent({
    place: codeOf(values.placeId),
    rockType: codeOf(values.rockTypeId),
    nonProd: codeOf(values.nonProdId),
    sir: codeOf(values.sirId),
    pit: codeOf(values.pitId),
    bargingNo: values.bargingNo,
    sequenceNo: number(values.sequenceNo),
    sampleNo: number(values.sampleNo),
    sackCount: number(values.sackCount),
  });
}

export function SampleIdentityFields({
  values,
  onChange,
  options,
  /** Off where the caller already prints the composed id beside the block. */
  showPreview = true,
  canCreate = false,
}: {
  values: IdentityValues;
  onChange: (values: IdentityValues) => void;
  /** Read once by the caller: a generate holds many of these at a time. */
  options: MasterOptionDTO[];
  showPreview?: boolean;
  /** Whether a code missing from a picker may be added to the master data. */
  canCreate?: boolean;
}) {
  const t = useTranslations("database.identity");
  const tMaster = useTranslations("masterData");

  const ident = composeIdentity(values, options);

  function set(field: keyof IdentityValues, value: string) {
    onChange({ ...values, [field]: value });
  }

  return (
    // A container query, not a breakpoint. The same fields render in two very
    // different widths — a full-width card on the generate page, and one half
    // of a split dialog on Enter Results — and the window tells you nothing
    // about which. Measuring the space actually available means three columns
    // where they fit and two where they would be cramped, with no prop for a
    // caller to get wrong.
    <div className="@container flex flex-col gap-3">
      {/* Nine fields: three rows instead of five wherever there is room for
          it, which is what keeps the generate page inside one screen. */}
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3">
        {PICKERS.map(({ field, kind, optional }) => {
          const forKind = options.filter((option) => option.kind === kind);
          const items: Record<string, string> = {
            [NONE]: optional ? t("none") : t("choose"),
            ...Object.fromEntries(
              forKind.map((option) => [option.id, option.label ? `${option.code} — ${option.label}` : option.code])
            ),
          };

          return (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`ident-${field}`}>{tMaster(`kind.${kind}`)}</Label>
              <MasterCombobox
                id={`ident-${field}`}
                kind={kind}
                value={values[field]}
                items={items}
                options={options}
                canCreate={canCreate}
                onValueChange={(value) => set(field, value || NONE)}
              />
            </div>
          );
        })}

        {NUMBERS.map(({ field, max }) => (
          <div key={field} className="flex flex-col gap-1.5">
            <Label htmlFor={`ident-${field}`}>{t(field)}</Label>
            <Input
              id={`ident-${field}`}
              inputMode="numeric"
              min={0}
              max={max}
              placeholder="—"
              value={values[field]}
              onChange={(event) => set(field, event.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Shown as it is typed: the operator sees exactly what will be stored
          before committing to it. */}
      {showPreview ? (
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground">{t("preview")}</p>
          {ident === null ? (
            <p className="text-sm text-muted-foreground">{t("incomplete")}</p>
          ) : (
            <p className="font-mono text-sm font-semibold">{ident}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
