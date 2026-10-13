"use client";

import { useEffect, useState } from "react";
import type { ApiResult } from "@/core/types";
import type { MasterOptionDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";

/** The last answer, shown at once by the next form that asks. */
let cached: MasterOptionDTO[] | null = null;
/** One request at a time, shared by everyone who asks while it runs. */
let inFlight: Promise<MasterOptionDTO[] | null> | null = null;
/** Which request is the latest, so only it clears `inFlight` when done. */
let requests = 0;

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
      if (!body.success) return null;
      cached = body.data.options;
      return cached;
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
    (async () => {
      const fresh = await prefetchMasterOptions();
      if (live && fresh) setOptions(fresh);
    })();
    return () => {
      live = false;
    };
  }, []);

  return options;
}
