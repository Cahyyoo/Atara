"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * How a table's columns are arranged -- their order and the widths somebody
 * dragged them to -- remembered in this browser, per table.
 *
 * Same shape as usePersistedColumns, and for the same reason: localStorage
 * does not exist during the server render, so the saved layout arrives after
 * hydration through useSyncExternalStore rather than a state write in an
 * effect. Which columns are shown stays in that hook; this one only arranges.
 */

export interface TableLayout {
  /** Column keys, left to right. Completed against the defaults by the caller. */
  order: string[];
  /** Widths in pixels for the columns somebody resized; others use their default. */
  widths: Record<string, number>;
}

export const EMPTY_LAYOUT: TableLayout = { order: [], widths: {} };

type Store = { snapshot: TableLayout; loaded: boolean; listeners: Set<() => void> };

const stores = new Map<string, Store>();

function storeFor(key: string): Store {
  let store = stores.get(key);
  if (!store) {
    store = { snapshot: EMPTY_LAYOUT, loaded: false, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

function readStored(key: string): TableLayout {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_LAYOUT;
    const saved = JSON.parse(raw) as Partial<TableLayout>;
    const order = Array.isArray(saved.order)
      ? saved.order.filter((value): value is string => typeof value === "string")
      : [];
    const widths =
      saved.widths && typeof saved.widths === "object"
        ? Object.fromEntries(
            Object.entries(saved.widths).filter(
              (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])
            )
          )
        : {};
    return { order, widths };
  } catch {
    return EMPTY_LAYOUT;
  }
}

function listen(key: string, listener: () => void): () => void {
  const store = storeFor(key);
  if (!store.loaded) {
    store.loaded = true;
    store.snapshot = readStored(key);
  }
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function write(key: string, next: TableLayout): void {
  const store = storeFor(key);
  store.snapshot = next;
  try {
    if (next.order.length === 0 && Object.keys(next.widths).length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(next));
    }
  } catch {
    // Private mode or a full quota: the layout simply is not remembered.
  }
  for (const listener of store.listeners) listener();
}

export function useTableLayout(key: string): [TableLayout, (next: TableLayout) => void] {
  const subscribe = useCallback((listener: () => void) => listen(key, listener), [key]);
  const getSnapshot = useCallback(() => storeFor(key).snapshot, [key]);
  const getServerSnapshot = useCallback(() => EMPTY_LAYOUT, []);

  const layout = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLayout = useCallback((next: TableLayout) => write(key, next), [key]);
  return [layout, setLayout];
}

/** Test seam: the stores outlive a render by design. */
export function resetTableLayouts(): void {
  stores.clear();
}
