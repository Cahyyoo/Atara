import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma's settings, here rather than in package.json (deprecated there).
 *
 * The schema is a folder: one .prisma file per module (core, lab, eksplorasi,
 * system), read together as one schema. A new module adds its own file.
 *
 * With a config file Prisma stops loading .env by itself, hence dotenv above.
 */
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
