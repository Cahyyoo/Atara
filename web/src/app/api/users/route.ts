import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { createUserSchema, listUsersQuerySchema } from "@/lib/validation";
import { USER_SELECT } from "@/lib/user";
import { readJsonBody } from "@/lib/api-request";
import { roleDefaultHash } from "@/lib/role-password";

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageUsers");

    const { searchParams } = new URL(request.url);
    const query = listUsersQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const where: Prisma.UserWhereInput = query.search
      ? { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }] }
      : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return jsonSuccess({
      users,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCapability(request, "manageUsers");

    const body = createUserSchema.parse(await readJsonBody(request));
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new ApiError("That email address is already registered.", 409);
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email,
        // The role's default, which the new user replaces on their first
        // sign-in. Refused (409) while the role has none.
        password: await roleDefaultHash(body.role),
        role: body.role,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });

    return jsonSuccess(user, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
