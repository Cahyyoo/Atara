/**
 * For tests that read a route's source to check who may call it: a route
 * either calls the guard itself or declares it to `route()` (api-route.ts),
 * and both mean the same thing.
 */

/** Matches a route source guarded by `capability`, whichever way it asks. */
export function guard(capability: string): RegExp {
  return new RegExp(String.raw`requireCapability\(request, "${capability}"\)|capability: "${capability}"`);
}

/** Matches a route open to any signed-in caller, even one who must change their password. */
export const ANY_SESSION_EVEN_PASSWORD_CHANGE =
  /requireSession\(request, \{ allowPasswordChange: true \}\)|route\(\{ allowPasswordChange: true \}/;

/** How many handlers in a route source are guarded by `capability`. */
export function guardCount(source: string, capability: string): number {
  return source.match(new RegExp(guard(capability).source, "g"))?.length ?? 0;
}
