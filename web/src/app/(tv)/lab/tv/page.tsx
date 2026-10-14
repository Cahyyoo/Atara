import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { loadStageBoard } from "@/modules/lab/lib/stages/stage-board";
import { TvDashboard } from "@/modules/lab/components/tv/tv-dashboard";
import { loadYtdProduction } from "@/modules/lab/lib/analytics/ytd-production";

export const dynamic = "force-dynamic";

export default async function TvPage() {
  await requireCapabilityPage("viewDashboard");
  // The year's table is a heavier read: if it fails, the board still shows
  // and the table fills in on the next refresh.
  const [board, ytd] = await Promise.all([loadStageBoard(), loadYtdProduction().catch(() => null)]);
  return <TvDashboard initialBoard={board} initialYtd={ytd} />;
}
