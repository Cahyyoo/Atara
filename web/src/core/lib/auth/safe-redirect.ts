/**
 * The sign-in page sends the visitor wherever `?next=` points once they are
 * authenticated. Left unchecked that is an open redirect: an attacker links to
 * `/login?next=https://evil.example/`, the victim signs in on the real site —
 * correct domain, correct certificate, password manager behaving normally — and
 * is then handed to a page that can convincingly ask them to sign in "again".
 *
 * Only a path on this site is ever accepted.
 */
const DEFAULT_DESTINATION = "/home";

export function safeRedirectPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_DESTINATION
): string {
  if (!value) return fallback;

  // Must be a rooted path. "//evil.example" and "/\evil.example" are
  // protocol-relative URLs that browsers happily treat as another origin.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

  // A backslash is normalised to a forward slash by some browsers, so it can
  // smuggle a second leading slash past the check above.
  if (value.includes("\\")) return fallback;

  // Control characters can break the URL out of its expected shape.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  return value;
}
