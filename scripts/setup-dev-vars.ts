// Runs on `bun install`: keeps .dev.vars in step with .dev.vars.example. It
// creates .dev.vars when missing, and adds any variable the example sets that
// .dev.vars lacks, so a secret added later (such as BETTER_AUTH_SECRET) reaches
// every checkout. Each change-me becomes a fresh random value; values already
// in .dev.vars are never changed. A build script, so Bun APIs are fine here.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
/** Replaces each change-me value with a random one, leaving comments as they are. */
const fill = (text: string) =>
  text
    .split("\n")
    .map((line) => (/^\s*#/.test(line) ? line : line.replace(/change-me/g, randomSecret)))
    .join("\n");

if (existsSync(".dev.vars.example")) {
  const example = readFileSync(".dev.vars.example", "utf8");
  if (!existsSync(".dev.vars")) {
    writeFileSync(".dev.vars", fill(example));
    console.log("Created .dev.vars");
  } else {
    const current = readFileSync(".dev.vars", "utf8");
    const has = (name: string) => new RegExp(`^\\s*${name}\\s*=`, "m").test(current);
    const missing = example.split(/\r?\n/).filter((line) => {
      const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      return name !== undefined && !has(name);
    });
    if (missing.length) {
      const separator = current === "" || current.endsWith("\n") ? "" : "\n";
      writeFileSync(".dev.vars", `${current}${separator}${missing.map(fill).join("\n")}\n`);
      console.log(`Added ${missing.length} variable(s) to .dev.vars`);
    }
  }
}
