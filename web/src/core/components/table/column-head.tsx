"use client";

import { useRef, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { TableHead } from "@/core/components/ui/table";
import { cn } from "@/core/lib/utils";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, WIDTH_STEP, clampWidth } from "@/core/lib/ui/column-layout";
import { IoArrowDown, IoArrowUp, IoReorderTwoOutline, IoSwapVertical } from "react-icons/io5";

export interface ColumnHeadProps {
  columnKey: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
  className?: string;
  /** Sortable when given: the field the API sorts by. */
  sortField?: string;
  sort?: string;
  order?: string;
  onSort?: (field: string) => void;
  /** Reorderable by dragging the heading (and Alt+←/→ from the keyboard). */
  movable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStartColumn?: (key: string) => void;
  onDragOverColumn?: (key: string) => void;
  onDropColumn?: (key: string) => void;
  onDragEndColumn?: () => void;
  onNudge?: (key: string, step: -1 | 1) => void;
  /** Without an edge to drag when false: a table whose columns share the page's width. */
  resizable?: boolean;
  /** Called while dragging the edge (`final` false) and once when let go. */
  onResize?: (key: string, width: number, final: boolean) => void;
  onResetWidth?: (key: string) => void;
  /** Accessible names: "Resize Ni", "Move Ni". */
  resizeLabel?: string;
  moveHint: string;
  /**
   * For a narrow column: a long label wraps onto a second line instead of
   * being cut, and the grip icon is left out (the cursor still shows the
   * heading can be dragged).
   */
  compact?: boolean;
}

/**
 * A table heading whose width can be dragged and whose place can be dragged.
 *
 * The edge on the right is a handle (unless `resizable` is false): drag it,
 * press ←/→ on it, or double-click it to go back to the default width. A movable heading itself is draggable
 * onto another one; Alt+←/→ does the same from the keyboard. Sorting, when the
 * column sorts, stays a click on the label.
 */
export function ColumnHead({
  columnKey,
  label,
  width,
  align = "left",
  className,
  sortField,
  sort,
  order,
  onSort,
  movable = false,
  dragging = false,
  dropTarget = false,
  onDragStartColumn,
  onDragOverColumn,
  onDropColumn,
  onDragEndColumn,
  onNudge,
  resizable = true,
  onResize,
  onResetWidth,
  resizeLabel,
  moveHint,
  compact = false,
}: ColumnHeadProps) {
  const resizing = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const isSorted = sortField !== undefined && sort === sortField;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizing.current = { startX: event.clientX, startWidth: width, width };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = resizing.current;
    if (!drag) return;
    drag.width = clampWidth(drag.startWidth + event.clientX - drag.startX);
    onResize?.(columnKey, drag.width, false);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = resizing.current;
    if (!drag) return;
    resizing.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onResize?.(columnKey, drag.width, true);
  }

  function onHandleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onResize?.(columnKey, clampWidth(width + (event.key === "ArrowRight" ? WIDTH_STEP : -WIDTH_STEP)), true);
  }

  function onHeadKey(event: KeyboardEvent<HTMLTableCellElement>) {
    if (!movable || !event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    onNudge?.(columnKey, event.key === "ArrowRight" ? 1 : -1);
  }

  const dragProps = movable
    ? {
        draggable: true,
        onDragStart: (event: DragEvent<HTMLTableCellElement>) => {
          // A drag that began on the resize edge is a resize, not a move.
          if (resizing.current) {
            event.preventDefault();
            return;
          }
          event.dataTransfer?.setData("text/plain", columnKey);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          onDragStartColumn?.(columnKey);
        },
        onDragOver: (event: DragEvent<HTMLTableCellElement>) => {
          event.preventDefault();
          onDragOverColumn?.(columnKey);
        },
        onDrop: (event: DragEvent<HTMLTableCellElement>) => {
          event.preventDefault();
          onDropColumn?.(columnKey);
        },
        onDragEnd: () => onDragEndColumn?.(),
      }
    : {};

  const content = (
    <>
      {label}
      {sortField !== undefined ? (
        isSorted ? (
          order === "asc" ? (
            <IoArrowUp className="size-3.5 shrink-0" />
          ) : (
            <IoArrowDown className="size-3.5 shrink-0" />
          )
        ) : (
          <IoSwapVertical className="size-3.5 shrink-0 opacity-40" />
        )
      ) : null}
    </>
  );

  return (
    <TableHead
      data-column={columnKey}
      aria-sort={sortField !== undefined ? (isSorted ? (order === "asc" ? "ascending" : "descending") : "none") : undefined}
      title={movable ? moveHint : undefined}
      onKeyDown={onHeadKey}
      className={cn(
        "group/head relative overflow-hidden text-ellipsis",
        compact && "whitespace-normal",
        align === "right" && "text-right",
        align === "center" && "text-center",
        movable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
        dropTarget && "bg-primary/10 shadow-[inset_2px_0_0_var(--color-primary)]",
        className
      )}
      {...dragProps}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-1",
          align === "right" && "justify-end",
          align === "center" && "justify-center"
        )}
      >
        {movable && !compact ? (
          <IoReorderTwoOutline
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover/head:opacity-100"
          />
        ) : null}
        {sortField !== undefined && onSort ? (
          <button
            type="button"
            onClick={() => onSort(sortField)}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate transition-colors hover:text-foreground",
              isSorted ? "text-foreground" : undefined,
              align === "right" && "flex-row-reverse"
            )}
          >
            {content}
          </button>
        ) : (
          <span className={compact ? "line-clamp-2 break-words" : "truncate"}>{content}</span>
        )}
      </div>
      {resizable ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={resizeLabel}
          aria-valuenow={width}
          aria-valuemin={MIN_COLUMN_WIDTH}
          aria-valuemax={MAX_COLUMN_WIDTH}
          tabIndex={0}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => onResetWidth?.(columnKey)}
          onKeyDown={onHandleKey}
          className="absolute inset-y-1 right-0 w-2 cursor-col-resize touch-none rounded-sm after:absolute after:inset-y-1 after:right-0.5 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-primary focus-visible:outline-none focus-visible:after:w-0.5 focus-visible:after:bg-primary"
        />
      ) : null}
    </TableHead>
  );
}
