import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { USER_SELECT } from "@/lib/user";

/**
 * Ask for an authenticator, or start one over.
 *
 * The admin never handles the secret. This only marks the account as waiting
 * for a setup; the person scans their own QR code at their next sign-in, on
 * their own phone, and the first code they enter is what switches it on.
 *
 * On an account that already has one, this is the reset for a lost or
 * replaced phone: the old secret is wiped here, so the old phone stops working
 * the moment this returns, and a new one is set up at the next sign-in.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireCapability(request, "manageUsers");
    const { id } = await context.params;

    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new ApiError("User not found.", 404);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
        totpRequestedAt: new Date(),
        totpRequestedById: admin.userId,
      },
      select: USER_SELECT,
    });

    return jsonSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Switch the authenticator off.
 *
 * Like removing a face, there is deliberately no self-service version: any
 * way around a second factor that does not go through an admin becomes its
 * weakest point.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireCapability(request, "manageUsers");
    const { id } = await context.params;

    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new ApiError("User not found.", 404);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
        totpRequestedAt: null,
        totpRequestedById: null,
      },
      select: USER_SELECT,
    });

    return jsonSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}
