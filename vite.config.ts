import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";
import { resolveDb } from "./scripts/local-db/env";
import { startLocalDb } from "./scripts/local-db/server";

export default defineConfig(async ({ command, isPreview }): Promise<UserConfig> => {
  // In dev, hand the Worker its database: Turso when TURSO_DATABASE_URL is set
  // (in .dev.vars or the environment), else a local server over .data/local.db.
  // Wrangler ignores the environment once .dev.vars exists, so the resolved
  // values are passed explicitly. Never in a build: nothing local reaches dist/.
  // `vite preview` does not apply `config`; it reads the database from .dev.vars.
  let databaseVars: Record<string, string> | undefined;
  if (command === "serve" && !isPreview) {
    const db = resolveDb();
    if (db.kind === "turso") {
      databaseVars = { TURSO_DATABASE_URL: db.url, ...(db.authToken ? { TURSO_AUTH_TOKEN: db.authToken } : {}) };
    } else {
      // One server per dev process, even when Vite reloads this config.
      const shared = globalThis as { localDb?: ReturnType<typeof startLocalDb> };
      const local = await (shared.localDb ??= startLocalDb(db.file));
      console.log(`Local database: ${db.file}, served at ${local.url}`);
      databaseVars = { TURSO_DATABASE_URL: local.url };
    }
  }

  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      cloudflare(databaseVars ? { config: { vars: databaseVars } } : {}),
      tailwindcss(),
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    // The dev server is reached through a preview host it cannot know in advance, such as a
    // sandbox's own subdomain. Without this Vite answers every request "Blocked request".
    server: { allowedHosts: true },
    // Scan every source file at startup, so a dependency the app already imports anywhere is
    // pre-bundled before the first page load rather than re-optimized mid-session, which can
    // leave a long-running dev server holding module requests it never answers.
    optimizeDeps: { entries: ["src/**/*.{ts,tsx}"] },
  };
});
