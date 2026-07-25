import { defineConfig } from "drizzle-kit";

// Only used if you want `pnpm db:push` against a fresh database without
// docker's init.sql (e.g. a cloud postgres). Local dev doesn't need it.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
