import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/setup-dev-vars.ts", import.meta.url));
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kosuke-dev-vars-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const runSetup = () => execFileSync("bun", [script], { cwd: root });
const readVars = () => readFileSync(join(root, ".dev.vars"), "utf8");

describe("setup-dev-vars", () => {
  it("creates .dev.vars with fresh secrets and preserves comment lines", () => {
    const comments = "# Set secrets below\n  # DISABLED_SECRET=change-me\n";
    writeFileSync(join(root, ".dev.vars.example"), `${comments}FIRST_SECRET=change-me\nSECOND_SECRET=change-me\nMODE=local\n`);

    runSetup();

    const vars = readVars();
    expect(vars.startsWith(comments)).toBe(true);
    expect(vars.slice(comments.length)).toMatch(/^FIRST_SECRET=[0-9a-f]{64}\nSECOND_SECRET=[0-9a-f]{64}\nMODE=local\n$/);
    const [, first, second] = vars.match(/FIRST_SECRET=(\w+)\nSECOND_SECRET=(\w+)/) ?? [];
    expect(first).not.toBe(second);
  });

  it("appends only missing active assignments and leaves existing values alone on both runs", () => {
    const existing = "MODE=custom\nKEEP_SECRET=change-me\n# NEW_SECRET=old\nLOCAL_ONLY=yes\n";
    writeFileSync(join(root, ".dev.vars"), existing);
    writeFileSync(join(root, ".dev.vars.example"), "MODE=default\nKEEP_SECRET=change-me\nNEW_SECRET=change-me\n# DISABLED_SECRET=change-me\n");

    runSetup();

    const updated = readVars();
    expect(updated.startsWith(existing)).toBe(true);
    expect(updated.slice(existing.length)).toMatch(/^NEW_SECRET=[0-9a-f]{64}\n$/);

    runSetup();

    expect(readVars()).toBe(updated);
  });

  it("starts the appended variable on a new line when .dev.vars has no final newline", () => {
    writeFileSync(join(root, ".dev.vars"), "MODE=custom");
    writeFileSync(join(root, ".dev.vars.example"), "REGION=local\n");

    runSetup();

    expect(readVars()).toBe("MODE=custom\nREGION=local\n");
  });

  it("preserves literal values that merely contain the placeholder text", () => {
    writeFileSync(join(root, ".dev.vars.example"), "ENDPOINT=https://example.test/change-me/help\n");

    runSetup();

    expect(readVars()).toBe("ENDPOINT=https://example.test/change-me/help\n");
  });
});
