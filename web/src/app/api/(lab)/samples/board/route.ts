import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { loadStageBoard } from "@/modules/lab/lib/stages/stage-board";
import { hidesSampleIdent, visibleIdent } from "@/modules/lab/lib/settings/ident-visibility";

/**
 * The TV view's data: where every live sample is now, stage by stage. Also the
 * mobile app's to-do list, which may be kept from the Sample IDs on it.
 */
export const GET = route({ capability: "viewDashboard" }, async ({ session }) => {
  const [board, hide] = await Promise.all([loadStageBoard(), hidesSampleIdent(session)]);
  return jsonSuccess({
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => visibleIdent(card, hide)),
    })),
  });
});
