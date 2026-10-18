import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import type { Env } from "../env";
import * as schema from "./schema";

// The app's one database, on Turso (libSQL over HTTP). In dev without Turso,
// vite.config.ts points TURSO_DATABASE_URL at a local server over .data/local.db.
export function getDb(env: Pick<Env, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN">) {
  if (!env.TURSO_DATABASE_URL) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. In production Kosuke sets it as a Worker secret; for `vite preview`, put it in .dev.vars.",
    );
  }
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN || undefined });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
