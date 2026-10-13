import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { loadStageBoard } from "@/modules/lab/lib/stages/stage-board";
import { TvDashboard } from "@/modules/lab/components/tv/tv-dashboard";

export const dynamic = "force-dynamic";

export default async function TvPage() {
  await requireCapabilityPage("viewDashboard");
  return <TvDashboard initialBoard={await loadStageBoard()} />;
}
