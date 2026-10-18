import { defineConfig } from "drizzle-kit";
import { resolveDb } from "./scripts/local-db/env";

// Generates SQL into migrations/ and applies it to the app's one database:
// Turso when TURSO_DATABASE_URL is set (in .dev.vars or the environment), the
// local file .data/local.db otherwise. See README.md.
//   bun run db:generate        write a migration from worker/db/schema.ts
//   bun run db:migrate         apply migrations
//   bun run db:migrate:remote  apply them to Turso, and fail without a Turso URL
const db = resolveDb();

export default defineConfig({
  dialect: "turso",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
  dbCredentials:
    db.kind === "turso" ? { url: db.url, authToken: db.authToken } : { url: `file:${db.file}` },
});
