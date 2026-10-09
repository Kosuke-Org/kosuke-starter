import { defineConfig } from "drizzle-kit";

// Generates SQL into migrations/. Wrangler applies it:
//   local:      bun run db:migrate
//   production: bun run db:migrate:remote
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
