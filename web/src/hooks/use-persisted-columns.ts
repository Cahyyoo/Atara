"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which optional columns a table shows, remembered between visits.
 *
 * Somebody who switches on Al₂O₃ and Measurement Method does it because that
 * is what they work with, and the table used to forget both on every visit.
 * Kept per page (the database and the entry grid are used for different
 * jobs) and in this browser only: it is a preference, not data.
 *
 * Through useSyncExternalStore for the same reason as the label print
 * settings: localStorage does not exist while the page renders on the server,
 * so the stored value has to arrive after hydration without a state write in
 * an effect. The store lives at module level, and only the functions below
 * touch it.
 */

type Store = { snapshot: string[]; loaded: boolean; listeners: Set<() => void> };

const stores = new Map<string, Store>();

function storeFor(key: string, fallback: readonly string[]): Store {
  let store = stores.get(key);
  if (!store) {
    store = { snapshot: [...fallback], loaded: false, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

function readStored(key: string, fallback: readonly string[], allowed: readonly string[]): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [...fallback];
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return [...fallback];
    // A column that no longer exists is dropped rather than rendered empty.
    return saved.filter((value): value is string => typeof value === "string" && allowed.includes(value));
  } catch {
    return [...fallback];
  }
}

function listen(
  key: string,
  fallback: readonly string[],
  allowed: readonly string[],
  listener: () => void
): () => void {
  const store = storeFor(key, fallback);
  // React re-reads the snapshot right after subscribing, so loading here is
  // what gets the stored value on screen.
  if (!store.loaded) {
    store.loaded = true;
    store.snapshot = readStored(key, fallback, allowed);
  }
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function snapshotOf(key: string, fallback: readonly string[]): string[] {
  return storeFor(key, fallback).snapshot;
}

function write(key: string, fallback: readonly string[], next: string[]): void {
  const store = storeFor(key, fallback);
  store.snapshot = next;
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the choice simply is not remembered.
  }
  for (const listener of store.listeners) listener();
}

export function usePersistedColumns<T extends string>(
  key: string,
  /** Module constants at every call site, so their identity never changes. */
  fallback: readonly T[],
  allowed: readonly T[]
): [T[], (next: T[]) => void] {
  const subscribe = useCallback(
    (listener: () => void) => listen(key, fallback, allowed, listener),
    [key, fallback, allowed]
  );
  const getSnapshot = useCallback(() => snapshotOf(key, fallback), [key, fallback]);
  const getServerSnapshot = useCallback(() => fallback as unknown as string[], [fallback]);

  const columns = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) as T[];
  const setColumns = useCallback((next: T[]) => write(key, fallback, next), [key, fallback]);

  return [columns, setColumns];
}

/** Test seam: the stores outlive a render by design. */
export function resetPersistedColumns(): void {
  stores.clear();
}
