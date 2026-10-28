"use client";

import type { ClipboardEvent, ReactNode } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { cn } from "@/core/lib/utils";
import type { BoxProps } from "@/modules/eksplorasi/components/sheet/sheet-grid";
import { IoCheckmark, IoChevronDown, IoSearchOutline } from "react-icons/io5";

/** The empty choice: nothing picked. A key no name can be. */
const NONE = "";

/** How a list kept in the browser is searched: "Oreas 189", "oreas-189" and "189" all find Oreas189. */
export function looseMatch(item: string, search: string) {
  const wanted = search.toLowerCase().replace(/[^a-z0-9]/g, "");
  return wanted === "" || item.toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted);
}

/**
 * A sheet box whose value is picked from a list that can be searched: the
 * Remarks of every list (OREAS names, or the Duplicate list's Sample IDs).
 *
 * Drawn as the sheet's other boxes are, and carries their grid attributes
 * (`box`), so selecting, copying and moving through the sheet go on working.
 * A value the list does not have (typed earlier, pasted, imported) stays
 * visible as a choice of its own, as the type box keeps text it does not know.
 *
 * The search is the caller's: with `filter` the list is searched here; with
 * `filter={null}` the caller asks the server and hands back what it found,
 * and then the empty choice and the stored value show only before anything
 * is typed -- they are not answers to a search.
 */
export function PickerCell({
  box,
  value,
  items,
  query,
  onQueryChange,
  onOpenChange,
  filter,
  searchLabel,
  emptyLabel,
  status,
  disabled,
  className,
  onChange,
}: {
  box: BoxProps;
  value: string;
  items: readonly string[];
  query: string;
  onQueryChange: (query: string) => void;
  onOpenChange?: (open: boolean) => void;
  filter: ((item: string, search: string) => boolean) | null;
  searchLabel: string;
  /** Shown when nothing is left to pick; null while an answer is on its way. */
  emptyLabel: string | null;
  /** A line under the choices: loading, or how to narrow a long answer. */
  status?: ReactNode;
  disabled: boolean;
  className: string;
  onChange: (value: string) => void;
}) {
  const searching = filter === null && query.trim() !== "";
  const choices = searching
    ? [...items]
    : [NONE, ...items.filter((item) => item !== NONE), ...(value && !items.includes(value) ? [value] : [])];

  // One value pasted into the box is its own to take: the grid only spreads blocks.
  const paste = (event: ClipboardEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onChange(event.clipboardData.getData("text/plain").trim());
  };

  return (
    <Combobox.Root<string>
      modal={false}
      items={choices}
      value={value}
      onValueChange={(next) => onChange(next ?? NONE)}
      onOpenChange={(open) => {
        if (open) onQueryChange("");
        onOpenChange?.(open);
      }}
      inputValue={query}
      onInputValueChange={onQueryChange}
      itemToStringLabel={(item) => item || "—"}
      filter={filter}
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
                aria-label={searchLabel}
                placeholder={searchLabel}
                className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">{emptyLabel}</Combobox.Empty>
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
            {status ? (
              <Combobox.Status className="border-t px-3 py-2 text-xs text-muted-foreground">{status}</Combobox.Status>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
