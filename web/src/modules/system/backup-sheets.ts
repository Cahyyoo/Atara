import "server-only";

import { prisma } from "@/core/lib/prisma";
import { when, type BackupSection } from "@/core/lib/sheets/backup-kit";

/**
 * The accounts, without their password hash, authenticator secret or face
 * readings: a backup file gets copied around, and none of those belong in one.
 */
export const backupSection: BackupSection = {
  counts: async () => {
    return { users: await prisma.user.count() };
  },
  sheets: () => {
    return [
      {
        name: "Users",
        columns: [
          { header: "Name", key: "name", width: 22 },
          { header: "Email", key: "email", width: 28 },
          { header: "Role", key: "role", width: 12 },
          { header: "Department", key: "department", width: 12 },
          { header: "Active", key: "isActive", width: 8 },
          { header: "Created At", key: "createdAt", width: 20 },
        ],
        rows: async function* () {
          // Selected column by column: nothing secret can ride along by accident.
          const users = await prisma.user.findMany({
            select: { name: true, email: true, role: true, department: true, isActive: true, createdAt: true },
            orderBy: { name: "asc" },
          });
          for (const user of users) {
            yield {
              name: user.name,
              email: user.email,
              role: user.role,
              department: user.department,
              isActive: user.isActive ? "Yes" : "No",
              createdAt: when(user.createdAt),
            };
          }
        },
      },
    ];
  },
  about: [["Users", "users"]],
};
