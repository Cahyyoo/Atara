"use client";

import { useEffect, useState } from "react";
import type { ApiResult } from "@/core/types";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";

/** The last answer, shown at once by the next form that asks. */
let cached: MasterOptionDTO[] | null = null;
/** One request at a time, shared by everyone who asks while it runs. */
let inFlight: Promise<MasterOptionDTO[] | null> | null = null;
/** Which request is the latest, so only it clears `inFlight` when done. */
let requests = 0;
/** Every mounted form, told at once when a code is added from any of them. */
const listeners = new Set<(options: MasterOptionDTO[]) => void>();

function publish(options: MasterOptionDTO[]) {
  cached = options;
  for (const listener of listeners) listener(options);
}

/**
 * Ask for the vocabularies ahead of time -- when rows are ticked, before the
 * identity dialog is opened -- so the form opens with its codes in place.
 * Resolves to the fresh list, or null when the request failed.
 */
export function prefetchMasterOptions(): Promise<MasterOptionDTO[] | null> {
  if (inFlight) return inFlight;
  const mine = ++requests;
  const request = (async () => {
    // Settle asynchronously even when fetch throws at once, so the request
    // below is registered before it is cleared.
    await Promise.resolve();
    try {
      const response = await fetch(withBasePath("/api/master-options?activeOnly=true"));
      const body: ApiResult<{ options: MasterOptionDTO[] }> = await response.json();
      if (!body.success || !Array.isArray(body.data?.options)) return null;
      publish(body.data.options);
      return body.data.options;
    } catch {
      // A picker with no options is visibly empty; no separate error surface
      // is worth adding for it here.
      return null;
    } finally {
      if (requests === mine) inFlight = null;
    }
  })();
  inFlight = request;
  return request;
}

/**
 * The five master vocabularies.
 *
 * Lifted out of the identity fields when a generate became a list of them: the
 * fetch used to live inside the block, so ten barcodes asked the server the
 * same question ten times. The caller holding the list calls this once and
 * hands the answer down.
 *
 * Stale while revalidating: a form starts on the last answer, so its pickers
 * show codes from the first frame, and still asks again so a code added since
 * appears a moment later.
 *
 * Retired options are left out — they may still be read on an existing record,
 * but nothing new should be filed under them.
 */
export function useMasterOptions(): MasterOptionDTO[] {
  const [options, setOptions] = useState<MasterOptionDTO[]>(() => cached ?? []);

  useEffect(() => {
    let live = true;
    listeners.add(setOptions);
    (async () => {
      const fresh = await prefetchMasterOptions();
      if (live && fresh) setOptions(fresh);
    })();
    return () => {
      live = false;
      listeners.delete(setOptions);
    };
  }, []);

  return options;
}

/** What adding a code answers: the option, or why it could not be added. */
export type CreateMasterOptionResult = { ok: true; option: MasterOptionDTO } | { ok: false; error: string };

/**
 * Adds a code to a master list from wherever it is being picked, the way
 * Odoo's "Create" does, and hands every open form the longer list.
 *
 * A code someone else added a moment ago is not an error: the list is asked
 * again and that option is answered instead, so the pick still goes through.
 */
export async function createMasterOption(
  kind: MasterKind,
  code: string,
  label?: string | null
): Promise<CreateMasterOptionResult> {
  const wanted = code.trim().toUpperCase();
  // At the end of its list, where a code added last is looked for.
  const sortOrder = (cached ?? [])
    .filter((option) => option.kind === kind)
    .reduce((highest, option) => Math.max(highest, option.sortOrder + 1), 0);
  try {
    const response = await fetch(withBasePath("/api/master-options"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, code: wanted, label: label?.trim() || undefined, sortOrder: Math.min(sortOrder, 9999) }),
    });
    const body: ApiResult<MasterOptionDTO> = await response.json();
    if (body.success) {
      publish([...(cached ?? []).filter((option) => option.id !== body.data.id), body.data]);
      return { ok: true, option: body.data };
    }
    if (response.status === 409) {
      const fresh = await prefetchMasterOptions();
      const existing = fresh?.find((option) => option.kind === kind && option.code === wanted);
      if (existing) return { ok: true, option: existing };
    }
    return { ok: false, error: body.error };
  } catch {
    return { ok: false, error: "" };
  }
}
