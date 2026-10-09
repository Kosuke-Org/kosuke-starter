import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "./db";
import type { Env } from "./env";

// One instance per request: bindings only exist inside a request on Workers.
export function createAuth(env: Env, origin: string) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? origin,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(env.DB), { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;
