import { z } from "zod";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { readJsonBody } from "@/core/lib/http/api-request";
import { getMobileServerUrl, setMobileServerUrl } from "@/modules/system/lib/mobile-server";

const updateSchema = z.object({ mobileServerUrl: z.string().max(500) }).strict();

/** The server address the mobile apps follow, as it stands. */
export const GET = route({ capability: "manageMobileServer" }, async () => {
  return jsonSuccess({ mobileServerUrl: await getMobileServerUrl() });
});

/** Changes it; nothing is saved unless the address answers as this server. */
export const PATCH = route({ capability: "manageMobileServer" }, async ({ request, session }) => {
  const { mobileServerUrl } = updateSchema.parse(await readJsonBody(request));
  return jsonSuccess({ mobileServerUrl: await setMobileServerUrl(mobileServerUrl, session.userId) });
});
