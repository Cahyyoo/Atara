import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { createUserSchema, listUsersQuerySchema } from "@/lib/validation";
import { USER_SELECT } from "@/lib/user";
import { readJsonBody } from "@/lib/api-request";
import { roleDefaultHash } from "@/lib/role-password";
import { assignableDepartments, canAssign, userScopeWhere } from "@/lib/user-scope";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCapability(request, "manageUsers");

    const { searchParams } = new URL(request.url);
    const query = listUsersQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    // Only the accounts this manager looks after (user-scope.ts): the super
    // admin sees the department admins, a department admin its own staff.
    const where: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(session),
        query.search
          ? { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }] }
          : {},
      ],
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ department: "asc" }, { role: "asc" }, { name: "asc" }],
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
    const session = await requireCapability(request, "manageUsers");

    const body = createUserSchema.parse(await readJsonBody(request));
    // Left out when the role fits only one department this manager can give.
    const choices = assignableDepartments(session, body.role);
    const department = body.department !== undefined ? body.department : choices.length === 1 ? choices[0] : null;
    if (!canAssign(session, body.role, department)) {
      throw new ApiError("You cannot create an account with that role in that department.", 403);
    }
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
        department,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });

    return jsonSuccess(user, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
