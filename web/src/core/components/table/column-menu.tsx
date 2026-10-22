"use client";

import { Button } from "@/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import { IoOptionsOutline, IoRefreshOutline } from "react-icons/io5";

export interface ColumnMenuItem {
  key: string;
  label: string;
  /** Always shown: ticked, and cannot be unticked. */
  locked?: boolean;
}

/**
 * Which of a table's columns show, ticked one by one, and a way back to the
 * default arrangement. Holds no wording of its own: the module passes its
 * labels, so any module's table can use it.
 */
export function ColumnMenu({
  columns,
  visible,
  onToggle,
  onShowAll,
  onReset,
  labels,
}: {
  columns: readonly ColumnMenuItem[];
  visible: readonly string[];
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onReset: () => void;
  labels: { button: string; showAll: string; reset: string };
}) {
  const shown = (column: ColumnMenuItem) => column.locked === true || visible.includes(column.key);
  const allShown = columns.every(shown);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="gap-2">
            <IoOptionsOutline className="size-4" />
            {labels.button}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={allShown} disabled={allShown} onCheckedChange={onShowAll} closeOnClick={false}>
            {labels.showAll}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.key}
              checked={shown(column)}
              disabled={column.locked}
              onCheckedChange={() => onToggle(column.key)}
              closeOnClick={false}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onReset}>
            <IoRefreshOutline className="size-4" />
            {labels.reset}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
