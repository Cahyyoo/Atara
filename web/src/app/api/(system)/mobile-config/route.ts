import { handleApiError, jsonSuccess } from "@/core/lib/http/api-response";
import { getMobileServerUrl, getServerId } from "@/modules/system/lib/mobile-server";

/**
 * The address the mobile apps should use, and who is answering.
 *
 * Unauthenticated, like /api/health: a phone asks before anyone has signed in,
 * and must find its server again even when the address it holds is the old
 * one. It returns an address the phones need anyway and a random id, nothing
 * else. The app moves only when the new address answers with the same id.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [serverUrl, serverId] = await Promise.all([getMobileServerUrl(), getServerId()]);
    return jsonSuccess({ serverUrl, serverId });
  } catch (error) {
    return handleApiError(error);
  }
}
