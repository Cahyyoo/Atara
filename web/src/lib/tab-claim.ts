/**
 * One tab at a time, within one browser.
 *
 * Every tab of a browser shares its session cookie, so the server cannot tell
 * two tabs apart -- the one-device rule stops at the browser. This is the rest
 * of it, between the tabs themselves: a tab that opens the app claims it, and
 * every other tab that hears the claim steps aside until it claims it back.
 *
 * A convenience for the person, not a security boundary: the tabs are theirs,
 * and the server's per-device rule is what holds against anybody else.
 */

export const TAB_CHANNEL = "atara-tab";

export interface TabClaim {
  type: "claim";
  tabId: string;
  /** Epoch milliseconds. Only for tie-breaking; clocks are the same browser's. */
  at: number;
}

export function makeClaim(tabId: string, at: number = Date.now()): TabClaim {
  return { type: "claim", tabId, at };
}

/** True when a message is another tab claiming the app: this tab steps aside. */
export function shouldYield(message: unknown, myTabId: string): boolean {
  if (!message || typeof message !== "object") return false;
  const claim = message as Partial<TabClaim>;
  return claim.type === "claim" && typeof claim.tabId === "string" && claim.tabId !== myTabId;
}
