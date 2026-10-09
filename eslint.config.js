import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".wrangler", "src/routeTree.gen.ts", "src/components/ui", "src/hooks/use-mobile.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowExportNames: ["Route"] }],
    },
  },
  {
    // TanStack Router route files export `Route` and keep their component local.
    files: ["src/routes/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Server code runs in workerd: no Bun or Node APIs.
    files: ["worker/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["node:*", "bun", "bun:*"], message: "Server code runs on Cloudflare Workers: use Web APIs, not Node or Bun ones." }] },
      ],
      "no-restricted-globals": ["error", { name: "Bun", message: "Bun is the package manager here, not the runtime." }, { name: "process", message: "Read bindings and secrets from c.env." }, { name: "Buffer", message: "Use Uint8Array and TextEncoder." }],
    },
  },
);
