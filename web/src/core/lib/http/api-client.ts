import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";

/**
 * Calling the app's own API from the browser, the one way: the base path
 * added, the `{ success, data | error }` answer read, and a network failure
 * turned into an answer of the same shape -- so a component has one branch
 * for "it failed", whatever failed.
 */

export type ApiOutcome<T> = { ok: true; data: T; status: number } | { ok: false; error: string; status: number };

/** The message shown when the server could not be reached at all. Overridable per call (translated). */
const NETWORK_ERROR = "Failed to reach the server. Please check your network connection.";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { networkError?: string }
): Promise<ApiOutcome<T>> {
  const { networkError, ...request } = init ?? {};
  try {
    const response = await fetch(withBasePath(path), request);
    const result = (await response.json().catch(() => null)) as ApiResult<T> | null;
    if (!result) return { ok: false, error: networkError ?? NETWORK_ERROR, status: response.status };
    return result.success
      ? { ok: true, data: result.data, status: response.status }
      : { ok: false, error: result.error, status: response.status };
  } catch (error) {
    // An aborted request is a superseded one: the caller ignores it.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: networkError ?? NETWORK_ERROR, status: 0 };
  }
}

/** A JSON body for apiFetch: method, header and the serialised value. */
export function jsonBody(method: "POST" | "PATCH" | "PUT" | "DELETE", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * Reads an NDJSON answer (one JSON object per line, see ndjson.ts) as it
 * arrives, handing each object to `onEvent`.
 */
export async function readNdjson(response: Response, onEvent: (event: Record<string, unknown>) => void): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}

/** Hands a Blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
