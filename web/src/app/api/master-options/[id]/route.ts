import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateMasterOptions } from "@/lib/master-options-cache";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { deleteMasterOptionSchema, updateMasterOptionSchema } from "@/lib/validation";
import { masterOptionCount, toMasterOptionDTO, usageOf } from "@/lib/master-option";
import { readJsonBody } from "@/lib/api-request";
import { invalidateAnalytics } from "@/lib/analytics-cache";
import { applyReplacement, planReplacement, summarizePlan } from "@/lib/master-option-delete";

/**
 * Retiring (`isActive: false`) takes a code out of the dropdowns and leaves the
 * history alone. Deleting it is DELETE below, and a code already inside Sample
 * IDs is only deleted by moving those records onto a replacement.
 *
 * The label is always editable. The **code** is only editable while nothing
 * uses it — it is baked into every Sample ID composed from it, and renaming it
 * afterwards would leave those ids saying something this list no longer does.
 * That is enforced here rather than in the form, because a disabled input stops
 * nobody who can send a request.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireCapability(request, "manageMasterData");
    const { id } = await params;
    const body = updateMasterOptionSchema.parse(await readJsonBody(request));

    const current = await prisma.masterOption.findUnique({
      where: { id },
      include: masterOptionCount,
    });
    if (!current) {
      throw new ApiError("That option no longer exists.", 404);
    }

    const code = body.code?.toUpperCase();
    const usage = usageOf(current);
    if (code && code !== current.code && usage > 0) {
      throw new ApiError(
        `"${current.code}" is already inside ${usage} Sample ID(s), so its code cannot change. ` +
          "Edit the description instead, or retire it and add the new code.",
        409
      );
    }
    if (code) {
      const clash = await prisma.masterOption.findUnique({
        where: { kind_code: { kind: current.kind, code } },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        throw new ApiError("That code already exists in this list.", 409);
      }
    }

    const option = await prisma.masterOption.update({
      where: { id },
      include: masterOptionCount,
      data: {
        ...(code ? { code } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    invalidateMasterOptions();
    return jsonSuccess(toMasterOptionDTO(option));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Deletes a code.
 *
 * Unused: it simply goes. Used: the records holding it are moved onto a
 * replacement of the same kind first, their Sample IDs rewritten and the move
 * written into each record's history -- the link is optional, so deleting
 * without moving would quietly blank the field on every one of them instead.
 *
 * All or nothing, in one transaction. A rewritten Sample ID that another
 * sample already has stops the whole thing (409, with the ids), and
 * `dryRun: true` reports the move without making it, for the confirmation.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability(request, "manageMasterData");
    const { id } = await params;
    const body = deleteMasterOptionSchema.parse(await readJsonBody(request));

    const option = await prisma.masterOption.findUnique({
      where: { id },
      include: masterOptionCount,
    });
    if (!option) {
      throw new ApiError("That option no longer exists.", 404);
    }
    const usage = usageOf(option);

    if (usage === 0) {
      if (body.dryRun) {
        return jsonSuccess({ affected: 0, examples: [], clashes: [] });
      }
      await prisma.masterOption.delete({ where: { id } });
      invalidateMasterOptions();
      return jsonSuccess({ deleted: option.code, moved: 0, replacement: null });
    }

    if (!body.replacementId) {
      throw new ApiError(
        `"${option.code}" is inside ${usage} Sample ID(s). Choose a code to move them to first.`,
        409
      );
    }
    const replacement = await prisma.masterOption.findUnique({
      where: { id: body.replacementId },
      select: { id: true, kind: true, code: true, isActive: true },
    });
    if (
      !replacement ||
      replacement.id === option.id ||
      replacement.kind !== option.kind ||
      !replacement.isActive
    ) {
      throw new ApiError("Choose another active code from the same list as the replacement.", 400);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const plan = await planReplacement(tx, option, replacement);
        if (body.dryRun) return summarizePlan(plan);
        if (plan.clashes.length > 0) {
          throw new ApiError(
            `Moving to "${replacement.code}" would give ${plan.clashes.length} sample(s) a Sample ID ` +
              `that already exists: ${plan.clashes.join(", ")}. Nothing was changed.`,
            409,
            undefined,
            { clashes: plan.clashes }
          );
        }
        await applyReplacement(tx, plan, option, replacement, session.userId);
        await tx.masterOption.delete({ where: { id } });
        return { deleted: option.code, moved: plan.moves.length, replacement: replacement.code };
      },
      { timeout: 30_000 }
    );

    if (!body.dryRun) {
      invalidateMasterOptions();
      invalidateAnalytics();
    }
    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
