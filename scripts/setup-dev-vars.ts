// Runs on `bun install`: creates .dev.vars with a random auth secret when it
// does not exist yet. A build script, so Bun APIs are fine here.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync(".dev.vars") && existsSync(".dev.vars.example")) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const text = readFileSync(".dev.vars.example", "utf8").replace("change-me", secret);
  writeFileSync(".dev.vars", text);
  console.log("Created .dev.vars");
}
