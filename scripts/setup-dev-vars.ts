// Runs on `bun install`: keeps .dev.vars in step with .dev.vars.example. It
// creates .dev.vars when missing, and adds any variable the example sets that
// .dev.vars lacks, so a secret added later (such as BETTER_AUTH_SECRET) reaches
// every checkout. A value of exactly change-me becomes a fresh random one.
// Existing lines of .dev.vars are never rewritten: new ones are appended.
// A build script, so Bun APIs are fine here.
import { parse } from "dotenv";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
/** Gives a variable whose whole value is change-me a random one. Comments and other values stay. */
const fill = (line: string) =>
  line.replace(/^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)change-me(\s*)$/, (_, head, tail) => `${head}${randomSecret()}${tail}`);

if (existsSync(".dev.vars.example")) {
  const example = readFileSync(".dev.vars.example", "utf8");
  if (!existsSync(".dev.vars")) {
    writeFileSync(".dev.vars", example.split("\n").map(fill).join("\n"));
    console.log("Created .dev.vars");
  } else {
    const current = readFileSync(".dev.vars", "utf8");
    // The same parser Wrangler reads .dev.vars with, so `export X=`, quotes
    // and multi-line values count as set.
    const set = new Set(Object.keys(parse(current)));
    // One `NAME=value` line per variable: the example keeps to that form.
    const missing = example.split(/\r?\n/).filter((line) => {
      const name = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      return name !== undefined && !set.has(name);
    });
    if (missing.length) {
      const separator = current === "" || current.endsWith("\n") ? "" : "\n";
      appendFileSync(".dev.vars", `${separator}${missing.map(fill).join("\n")}\n`);
      console.log(`Added ${missing.length} variable(s) to .dev.vars`);
    }
  }
}
