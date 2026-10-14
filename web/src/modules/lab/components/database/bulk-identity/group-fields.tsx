"use client";

import { memo, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { MasterOptionDTO } from "@/modules/lab/types";
import { PickerField, TextField } from "@/modules/lab/components/database/bulk-identity/identity-fields";
import {
  MIXED,
  NONE,
  PICKERS,
  TEXTS,
  type FieldKey,
  type GroupState,
  type GroupUpdate,
  type Initial,
  type PickerKey,
} from "@/modules/lab/components/database/bulk-identity/identity-plan";

/**
 * The identity fields of one form. Memoised with stable props from the
 * parent, and each field memoised again, so typing one letter redraws one
 * field -- not the form, and not the other forms.
 */
export const GroupFields = memo(function GroupFields({
  index,
  several,
  initial,
  state,
  options,
  canCreate,
  onChange,
}: {
  index: number;
  several: boolean;
  initial: Initial;
  state: GroupState;
  options: MasterOptionDTO[];
  /** Whether a missing code may be added to the master data from a picker. */
  canCreate: boolean;
  onChange: GroupUpdate;
}) {
  const t = useTranslations("database.bulkIdentity");
  const tIdentity = useTranslations("database.identity");
  const tMaster = useTranslations("masterData");

  const setValue = useCallback(
    (fieldKey: FieldKey, value: string) =>
      onChange(index, (previous) => ({ ...previous, values: { ...previous.values, [fieldKey]: value } })),
    [index, onChange]
  );
  const setSequential = useCallback(
    (sequential: boolean) => onChange(index, (previous) => ({ ...previous, sequential })),
    [index, onChange]
  );

  // Built once per form, not on every keystroke: a new list makes the picker
  // rebuild its items.
  const itemsByKey = useMemo(
    () =>
      Object.fromEntries(
        PICKERS.map(({ key, kind }) => {
          const items: Record<string, string> = {
            ...(initial[key].mixed ? { [MIXED]: t("mixedOption") } : {}),
            [NONE]: t("emptyOption"),
            ...Object.fromEntries(
              options
                .filter((option) => option.kind === kind && option.isActive)
                .map((option) => [option.id, option.code])
            ),
          };
          // A code retired since these records were made still shows as itself.
          const start = initial[key].start;
          if (!items[start]) items[start] = options.length === 0 ? "…" : start;
          return [key, items];
        })
      ) as Record<PickerKey, Record<string, string>>,
    [initial, options, t]
  );

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @2xl:grid-cols-3">
        {PICKERS.map(({ key: fieldKey, kind }) => (
          <PickerField
            key={fieldKey}
            index={index}
            fieldKey={fieldKey}
            label={tMaster(`kind.${kind}`)}
            value={state.values[fieldKey]}
            start={initial[fieldKey].start}
            mixed={initial[fieldKey].mixed}
            items={itemsByKey[fieldKey]}
            kind={kind}
            options={options}
            canCreate={canCreate}
            onSet={setValue}
          />
        ))}
        {TEXTS.map(({ key: fieldKey, numeric }) => (
          <TextField
            key={fieldKey}
            index={index}
            fieldKey={fieldKey}
            label={tIdentity(fieldKey)}
            numeric={numeric}
            value={state.values[fieldKey]}
            start={initial[fieldKey].start}
            mixed={initial[fieldKey].mixed}
            onSet={setValue}
            sequential={fieldKey === "sampleNo" && several ? state.sequential : undefined}
            onSequential={setSequential}
          />
        ))}
      </div>
    </div>
  );
});
