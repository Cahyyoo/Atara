import { requireCapabilityPage } from "@/lib/page-auth";
import { loadStageBoard } from "@/lib/stage-board";
import { TvDashboard } from "@/components/tv/tv-dashboard";

export const dynamic = "force-dynamic";

export default async function TvPage() {
  await requireCapabilityPage("viewDashboard");
  return <TvDashboard initialBoard={await loadStageBoard()} />;
}
