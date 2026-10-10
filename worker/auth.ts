import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "./db";
import type { Env } from "./env";

// Published apps share the parent domain (kosuke.app), so another app on a
// sibling subdomain could set a cookie on the parent and shadow this app's
// session. A `__Host-` cookie cannot be set or overwritten from another
// subdomain: the browser accepts it only with Secure, Path=/ and no Domain.
// Better Auth would otherwise prefix `__Secure-`, which gives no such
// guarantee, so its own prefix is switched off and Secure is set directly.
// Plain http (local dev) keeps the default names, since `__Host-` needs https.
function hostOnlyCookies(baseURL: string) {
  if (!baseURL.startsWith("https://")) return {};
  return {
    useSecureCookies: false,
    cookiePrefix: "__Host-better-auth",
    defaultCookieAttributes: { secure: true, path: "/" },
  };
}

// One instance per request: bindings only exist inside a request on Workers.
export function createAuth(env: Env, origin: string) {
  const baseURL = env.BETTER_AUTH_URL ?? origin;
  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(env.DB), { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    advanced: hostOnlyCookies(baseURL),
  });
}

export type Auth = ReturnType<typeof createAuth>;
