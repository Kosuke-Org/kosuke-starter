import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    cloudflare(),
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
});
