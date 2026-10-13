"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import { ASSAY_FIELDS, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";
import type { Column } from "@/modules/lab/components/assay/results-entry-utils";
import { IoOptionsOutline } from "react-icons/io5";

interface ResultsColumnPickerProps {
  visible: Column[];
  showRemarks: boolean;
  onToggle: (column: Column) => void;
}

/** Which columns the entry screen shows. */
export function ResultsColumnPicker({ visible, showRemarks, onToggle }: ResultsColumnPickerProps) {
  const tDatabase = useTranslations("database");
  const tCommon = useTranslations("common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="gap-2">
            <IoOptionsOutline className="size-4" />
            {tCommon("columns")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{tCommon("columns")}</DropdownMenuLabel>
          {ASSAY_FIELDS.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.key}
              checked={visible.includes(field.key)}
              onCheckedChange={() => onToggle(field.key)}
              closeOnClick={false}
            >
              {field.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuLabel>{tDatabase("instrumentColumns")}</DropdownMenuLabel>
          {INSTRUMENT_FIELDS.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.key}
              checked={visible.includes(field.key)}
              onCheckedChange={() => onToggle(field.key)}
              closeOnClick={false}
            >
              {tDatabase(field.key)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuCheckboxItem
            checked={showRemarks}
            onCheckedChange={() => onToggle("remarks")}
            closeOnClick={false}
          >
            {tDatabase("dialog.remarks")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
