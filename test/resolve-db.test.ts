import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDb } from "../scripts/local-db/env";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kosuke-resolve-db-"));
  vi.stubEnv("TURSO_DATABASE_URL", undefined);
  vi.stubEnv("TURSO_AUTH_TOKEN", undefined);
  vi.stubEnv("DB_REQUIRE_REMOTE", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("resolveDb", () => {
  it("parses quoted values with trailing comments like Wrangler", () => {
    writeFileSync(join(root, ".dev.vars"), 'TURSO_DATABASE_URL="libsql://app-org.turso.io" # app database\n');
    expect(resolveDb(root)).toEqual({ kind: "turso", url: "libsql://app-org.turso.io", authToken: undefined });
  });

  it("prefers .dev.vars over the process environment", () => {
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://environment.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "environment-token");
    writeFileSync(join(root, ".dev.vars"), "TURSO_DATABASE_URL=libsql://file.turso.io\nTURSO_AUTH_TOKEN=file-token\n");
    expect(resolveDb(root)).toEqual({ kind: "turso", url: "libsql://file.turso.io", authToken: "file-token" });
  });

  it("uses the environment when .dev.vars does not set the database", () => {
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://environment.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "environment-token");
    expect(resolveDb(root)).toEqual({ kind: "turso", url: "libsql://environment.turso.io", authToken: "environment-token" });
  });

  it("falls back to the local database", () => {
    expect(resolveDb(root)).toEqual({ kind: "local", file: join(root, ".data/local.db") });
  });

  it("requires a URL when remote migrations are requested", () => {
    vi.stubEnv("DB_REQUIRE_REMOTE", "1");
    expect(() => resolveDb(root)).toThrow("TURSO_DATABASE_URL is not set");
  });

  it.each(["http://127.0.0.1:8080", "http://localhost:8080", "http://[::1]:8080", "file:local.db"])(
    "refuses the local URL %s for remote migrations",
    (url) => {
      vi.stubEnv("DB_REQUIRE_REMOTE", "1");
      vi.stubEnv("TURSO_DATABASE_URL", url);
      expect(() => resolveDb(root)).toThrow("a local database");
    },
  );

  it("allows a remote database for remote migrations", () => {
    vi.stubEnv("DB_REQUIRE_REMOTE", "1");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://app-org.turso.io");
    expect(resolveDb(root).kind).toBe("turso");
  });

  it.each(["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"])("rejects a blank %s instead of using an overridden fallback", (name) => {
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://environment.turso.io");
    vi.stubEnv("TURSO_AUTH_TOKEN", "environment-token");
    writeFileSync(join(root, ".dev.vars"), `${name}=\n`);
    expect(() => resolveDb(root)).toThrow(`${name} is blank in .dev.vars. Remove the line or fill it in`);
  });

  it("rejects a blank URL before selecting the local fallback", () => {
    writeFileSync(join(root, ".dev.vars"), "TURSO_DATABASE_URL=\n");
    expect(() => resolveDb(root)).toThrow("TURSO_DATABASE_URL is blank in .dev.vars");
  });
});
