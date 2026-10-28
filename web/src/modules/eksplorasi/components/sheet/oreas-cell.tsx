"use client";

import { useMemo, useState, type ClipboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@base-ui/react/combobox";
import { cn } from "@/core/lib/utils";
import type { BoxProps } from "@/modules/eksplorasi/components/sheet/sheet-grid";
import { IoCheckmark, IoChevronDown, IoSearchOutline } from "react-icons/io5";

/** The empty choice: no remark. A key no OREAS name can be. */
const NONE = "";

/**
 * The Standard list's Remarks: an OREAS standard from the CRM List, picked
 * from a list that can be searched -- type "189" and only Oreas189 is left.
 *
 * Drawn as the sheet's other boxes are, and carries their grid attributes
 * (`box`), so selecting, copying and moving through the sheet go on working.
 * A name the CRM List does not have (typed earlier, pasted) stays visible as
 * a choice of its own, as the type box keeps text it does not know.
 */
export function OreasCell({
  box,
  value,
  names,
  disabled,
  className,
  onChange,
}: {
  box: BoxProps;
  value: string;
  names: readonly string[];
  disabled: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("dataSource.sheet");
  const [query, setQuery] = useState("");
  const items = useMemo(
    () => [NONE, ...names, ...(value && !names.includes(value) ? [value] : [])],
    [names, value]
  );

  // One value pasted into the box is its own to take: the grid only spreads blocks.
  const paste = (event: ClipboardEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onChange(event.clipboardData.getData("text/plain").trim());
  };

  return (
    <Combobox.Root<string>
      modal={false}
      items={items}
      value={value}
      onValueChange={(next) => onChange(next ?? NONE)}
      onOpenChange={(open) => {
        if (open) setQuery("");
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={(item) => item || "—"}
      // "Oreas 189", "oreas-189" and "189" all find Oreas189.
      filter={(item, search) => {
        const wanted = search.toLowerCase().replace(/[^a-z0-9]/g, "");
        return wanted === "" || item.toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted);
      }}
      autoHighlight
    >
      <Combobox.Trigger
        {...box}
        disabled={disabled}
        onPaste={paste}
        className={cn(className, "flex items-center text-left")}
      >
        <span className={cn("min-w-0 flex-1 truncate", value === "" && "text-transparent group-hover:text-muted-foreground")}>
          {value || "—"}
        </span>
        <IoChevronDown
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 right-1 size-3 -translate-y-1/2 text-muted-foreground transition-opacity",
            value === "" && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Combobox.Popup className="relative isolate z-50 flex max-h-[min(var(--available-height),18rem)] w-56 origin-(--transform-origin) flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-raised duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center gap-2 border-b px-3">
              <IoSearchOutline aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <Combobox.Input
                aria-label={t("oreasSearch")}
                placeholder={t("oreasSearch")}
                className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">
              {t("oreasNoResults")}
            </Combobox.Empty>
            <Combobox.List className="min-h-0 flex-1 overflow-y-auto p-1 empty:hidden">
              {(item: string) => (
                <Combobox.Item
                  key={item || "none"}
                  value={item}
                  className="relative flex min-h-8 w-full cursor-default items-center rounded-lg py-1 pr-8 pl-2.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className={cn("flex-1 whitespace-nowrap", item === NONE && "text-muted-foreground")}>
                    {item || "—"}
                  </span>
                  <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <IoCheckmark />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
