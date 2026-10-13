"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import { ASSAY_FIELDS, ASSAY_TABLE_FIELDS, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";
import { ALL_COLUMNS, type Column } from "@/modules/lab/components/shared/lab-records-table/columns";
import { IoOptionsOutline, IoRefreshOutline } from "react-icons/io5";

/** Which element and instrument columns show, and a way back to the defaults. */
export function ColumnPicker({
  visibleFields,
  onVisibleFieldsChange,
  onToggleField,
  onResetLayout,
}: {
  visibleFields: Column[];
  onVisibleFieldsChange: (fields: Column[]) => void;
  onToggleField: (field: Column) => void;
  onResetLayout: () => void;
}) {
  const t = useTranslations("database");
  const tCommon = useTranslations("common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button data-tour="records-columns" variant="outline" className="gap-2">
            <IoOptionsOutline className="size-4" />
            {tCommon("columns")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        <DropdownMenuGroup>
          {/* Every column at once; ticked again, back to the usual few. */}
          <DropdownMenuCheckboxItem
            checked={ALL_COLUMNS.every((key) => visibleFields.includes(key))}
            onCheckedChange={() =>
              onVisibleFieldsChange(
                ALL_COLUMNS.every((key) => visibleFields.includes(key)) ? [...ASSAY_TABLE_FIELDS] : [...ALL_COLUMNS]
              )
            }
            closeOnClick={false}
          >
            {t("layout.selectAll")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{tCommon("columns")}</DropdownMenuLabel>
          {ASSAY_FIELDS.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.key}
              checked={visibleFields.includes(field.key)}
              onCheckedChange={() => onToggleField(field.key)}
              closeOnClick={false}
            >
              {field.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuLabel>{t("instrumentColumns")}</DropdownMenuLabel>
          {INSTRUMENT_FIELDS.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.key}
              checked={visibleFields.includes(field.key)}
              onCheckedChange={() => onToggleField(field.key)}
              closeOnClick={false}
            >
              {t(field.key)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onResetLayout}>
            <IoRefreshOutline className="size-4" />
            {t("layout.reset")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
