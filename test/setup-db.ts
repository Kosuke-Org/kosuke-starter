// A fresh database for each test file: the local libSQL server (the same one
// `bun run dev` uses without Turso) over a temp file, with every migration in
// migrations/ applied through it, the way drizzle-kit applies them to Turso.
import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalDb } from "../scripts/local-db/server";
import type { Env } from "../worker/env";

export async function setupDb() {
  const dir = mkdtempSync(join(tmpdir(), "kosuke-db-"));
  const server = await startLocalDb(join(dir, "test.db"));
  const client = createClient({ url: server.url });
  await migrate(drizzle(client), { migrationsFolder: "migrations" });
  const env = {
    TURSO_DATABASE_URL: server.url,
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  } as Env;
  return {
    env,
    /** Raw SQL, the way a Cron writes. */
    client,
    url: server.url,
    close: async () => {
      client.close();
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
