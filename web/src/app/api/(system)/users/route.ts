import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { createUserSchema, listUsersQuerySchema } from "@/modules/system/validation";
import { USER_SELECT } from "@/modules/system/lib/user";
import { readJsonBody } from "@/core/lib/http/api-request";
import { roleDefaultHash } from "@/modules/system/lib/role-password";
import { assignableDepartments, canAssign, userScopeWhere } from "@/modules/system/lib/user-scope";

export const GET = route({ capability: "manageUsers" }, async ({ request, session }) => {
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
});

export const POST = route({ capability: "manageUsers" }, async ({ request, session }) => {
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
});
