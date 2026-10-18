// Where the app's database is, for the tools that run outside the Worker:
// drizzle-kit (drizzle.config.ts), the dev server (vite.config.ts) and the tests.
//
// Same order as Wrangler gives the Worker its variables in dev: `.dev.vars`
// first, then the process environment. With neither, the app falls back to a
// local SQLite file, so dev works with no Turso account.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "dotenv";

/** The local fallback, relative to the project root. Gitignored. */
export const LOCAL_DB_FILE = ".data/local.db";

export type DbTarget =
  | { kind: "turso"; url: string; authToken?: string }
  | { kind: "local"; file: string };

export function resolveDb(root = process.cwd()): DbTarget {
  const devVars = readDevVars(resolve(root, ".dev.vars"));
  for (const name of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]) {
    if (devVars[name] !== undefined && !devVars[name].trim()) {
      throw new Error(`${name} is blank in .dev.vars. Remove the line or fill it in so migrations and the Worker use the same database settings.`);
    }
  }
  const pick = (name: string) => devVars[name] || process.env[name] || undefined;
  const url = pick("TURSO_DATABASE_URL");
  const requireRemote = process.env.DB_REQUIRE_REMOTE === "1";
  if (url && requireRemote && isLocalUrl(url)) {
    throw new Error(`TURSO_DATABASE_URL is ${url}, a local database. Point it at the app's Turso database.`);
  }
  if (url) return { kind: "turso", url, authToken: pick("TURSO_AUTH_TOKEN") };
  if (requireRemote) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Set it (and TURSO_AUTH_TOKEN) in the environment or in .dev.vars to migrate the production database.",
    );
  }
  const file = resolve(root, LOCAL_DB_FILE);
  mkdirSync(dirname(file), { recursive: true });
  return { kind: "local", file };
}

function isLocalUrl(url: string) {
  if (url.startsWith("file:")) return true;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Uses the same .dev.vars parser as Wrangler. */
function readDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parse(readFileSync(path, "utf8"));
}
