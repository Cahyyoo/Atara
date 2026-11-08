import { z } from "zod";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { readJsonBody } from "@/core/lib/http/api-request";
import { getLabSettings, setLabSettings } from "@/modules/lab/lib/settings/lab-settings";
import { acceptMobileServerUrl } from "@/modules/lab/lib/settings/mobile-server";

const updateLabSettingsSchema = z
  .object({
    mobileShowSampleIdent: z.boolean().optional(),
    mobileServerUrl: z.string().max(500).optional(),
  })
  .strict();

/** The lab admin's switches, as they stand. */
export const GET = route({ capability: "manageLabSettings" }, async () => {
  return jsonSuccess(await getLabSettings());
});

/** Changes the switches given; the rest keep their value. */
export const PATCH = route({ capability: "manageLabSettings" }, async ({ request, session }) => {
  const update = updateLabSettingsSchema.parse(await readJsonBody(request));
  // Nothing is saved unless the address answers as this server.
  if (update.mobileServerUrl !== undefined) {
    update.mobileServerUrl = await acceptMobileServerUrl(update.mobileServerUrl);
  }
  return jsonSuccess(await setLabSettings(update, session.userId));
});
