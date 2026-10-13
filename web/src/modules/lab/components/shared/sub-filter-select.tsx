"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { SUB_FILTERS, type SubFilter } from "@/modules/lab/validation/records";

/**
 * Which records a figure counts: the samples themselves (the default -- a
 * fraction such as "(-20)" must not pull a head sample's average about), every
 * record, or the sub-samples alone. One control, the same on every page that
 * reports on results.
 */
export function SubFilterSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: SubFilter;
  onChange: (value: SubFilter) => void;
  className?: string;
}) {
  const t = useTranslations("database.subs.filter");
  const items = Object.fromEntries(SUB_FILTERS.map((key) => [key, t(key)])) as Record<SubFilter, string>;

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {t("label")}
      </Label>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (typeof next === "string" && (SUB_FILTERS as readonly string[]).includes(next)) {
            onChange(next as SubFilter);
          }
        }}
      >
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} className={className ?? "w-44"}>
          <SelectValue>{(selected) => items[selected as SubFilter] ?? ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SUB_FILTERS.map((key) => (
            <SelectItem key={key} value={key}>
              {items[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
