import type { NextRequest } from "next/server";
import type { z } from "zod";
import type { SessionPayload } from "@/core/lib/auth/auth";
import type { Capability } from "@/core/lib/auth/permissions";
import { requireCapability, requireSession } from "@/core/lib/http/api-auth";
import { readJsonBody } from "@/core/lib/http/api-request";
import { handleApiError } from "@/core/lib/http/api-response";

/**
 * The frame every API route was writing by hand: check who is calling, read
 * and validate the input, run, and turn any thrown error into the right
 * status (handleApiError). The route keeps only what is its own.
 *
 *   export const GET = route(
 *     { capability: "manageDrilling", query: listDrillHolesQuerySchema },
 *     async ({ query }) => jsonSuccess(await listHoles(query))
 *   );
 *
 * A plain function around the handler -- the same awaits in the same order
 * as before, nothing added per request. Routes with a flow of their own (the
 * sign-in steps, a streamed answer) may still call the pieces directly.
 */

type Schema = z.ZodType;
type Infer<S> = S extends Schema ? z.output<S> : undefined;

export interface RouteOptions<B extends Schema | undefined, Q extends Schema | undefined> {
  /** The capability the caller's role and department must hold (permissions.ts). */
  capability?: Capability;
  /** With no capability: any signed-in caller, even one who must change their password first. */
  allowPasswordChange?: boolean;
  /** The JSON body, parsed with this schema (a 422 when it does not fit). */
  body?: B;
  /** The body size cap for this route (BODY_LIMIT); the default otherwise. */
  bodyLimit?: number;
  /** The query string, parsed with this schema. Empty values count as absent. */
  query?: Q;
}

export interface RouteContext<P, B, Q> {
  request: NextRequest;
  session: SessionPayload;
  params: P;
  body: B;
  query: Q;
}

/** The query string as an object, an empty value being the same as none. */
export function queryOf(request: NextRequest): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    out[key] = value === "" ? undefined : value;
  }
  return out;
}

export function route<
  P extends Record<string, string> = Record<string, never>,
  B extends Schema | undefined = undefined,
  Q extends Schema | undefined = undefined,
>(
  options: RouteOptions<B, Q>,
  handler: (context: RouteContext<P, Infer<B>, Infer<Q>>) => Promise<Response>
) {
  return async (request: NextRequest, context?: { params: Promise<P> }): Promise<Response> => {
    try {
      const session = options.capability
        ? await requireCapability(request, options.capability)
        : await requireSession(request, { allowPasswordChange: options.allowPasswordChange });
      const params = (context ? await context.params : {}) as P;
      const query = (options.query ? options.query.parse(queryOf(request)) : undefined) as Infer<Q>;
      const body = (
        options.body ? options.body.parse(await readJsonBody(request, options.bodyLimit)) : undefined
      ) as Infer<B>;
      return await handler({ request, session, params, body, query });
    } catch (error) {
      return handleApiError(error);
    }
  };
}
