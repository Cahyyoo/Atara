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
import { usePersistedColumns } from "@/core/hooks/use-persisted-columns";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import { CONTROL_ELEMENTS, type ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import { IoOptionsOutline } from "react-icons/io5";

/** Where the choice is kept in this browser; bump the version if its meaning changes. */
const STORAGE_KEY = "atara.eksplorasi.controlElements.v1";

/**
 * Which elements' control charts the dashboard shows: every one at first,
 * then whatever was ticked, remembered in this browser. Kept in the
 * standard order (CONTROL_ELEMENTS) however it was ticked.
 */
export function useControlElements(): [ControlElement[], (next: ControlElement[]) => void] {
  const [stored, setStored] = usePersistedColumns<ControlElement>(STORAGE_KEY, CONTROL_ELEMENTS, CONTROL_ELEMENTS);
  const shown = CONTROL_ELEMENTS.filter((element) => stored.includes(element));
  // Nothing usable stored (emptied by hand, or elements renamed since): all of them.
  return [shown.length > 0 ? shown : [...CONTROL_ELEMENTS], setStored];
}

/**
 * The Elements button: one box per element, and Show all. The last element
 * ticked cannot be unticked -- a dashboard with no chart on it says nothing.
 */
export function ControlElementPicker({
  shown,
  onChange,
}: {
  shown: readonly ControlElement[];
  onChange: (next: ControlElement[]) => void;
}) {
  const t = useTranslations("qcDashboard.control");

  const toggle = (element: ControlElement) =>
    onChange(
      shown.includes(element)
        ? shown.filter((other) => other !== element)
        : CONTROL_ELEMENTS.filter((other) => other === element || shown.includes(other))
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="gap-2">
            <IoOptionsOutline className="size-4" />
            {t("elementsCount", { shown: shown.length, total: CONTROL_ELEMENTS.length })}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("elements")}</DropdownMenuLabel>
          {CONTROL_ELEMENTS.map((element) => {
            const checked = shown.includes(element);
            return (
              <DropdownMenuCheckboxItem
                key={element}
                checked={checked}
                disabled={checked && shown.length === 1}
                onCheckedChange={() => toggle(element)}
                closeOnClick={false}
              >
                {ELEMENT_LABELS[element]}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={shown.length === CONTROL_ELEMENTS.length}
          onClick={() => onChange([...CONTROL_ELEMENTS])}
        >
          {t("showAll")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
