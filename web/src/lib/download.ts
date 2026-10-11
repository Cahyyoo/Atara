import { withBasePath } from "@/lib/base-path";

/**
 * Downloads a file from an API route via fetch, so an auth failure surfaces as
 * a readable message instead of a raw JSON tab (which is what window.open gives).
 * Returns an error message, or null when the download started.
 */
export async function downloadFromApi(url: string, fallbackName: string): Promise<string | null> {
  try {
    const response = await fetch(withBasePath(url));

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      return result?.error ?? `Export failed (${response.status}).`;
    }

    const disposition = response.headers.get("content-disposition") ?? "";
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = match?.[1] ?? fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    return null;
  } catch {
    return "Failed to reach the server. Please check your network connection.";
  }
}
