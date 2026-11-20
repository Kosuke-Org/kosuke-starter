// One smoke test over the real Worker app with a real database: the local
// libSQL server, migrations applied from migrations/ (see setup-db.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../worker";
import { setupDb } from "./setup-db";

let db: Awaited<ReturnType<typeof setupDb>>;

beforeAll(async () => {
  db = await setupDb();
});

afterAll(() => db?.close());

const call = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init, db.env);

describe("smoke", () => {
  it("answers /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("applies the migrations to a fresh database", async () => {
    const tables = await db.client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(tables.rows.map((row) => row.name)).toContain("__drizzle_migrations");
  });

  it("has no sign-in or records routes by default", async () => {
    expect((await call("/api/auth/get-session")).status).toBe(404);
    expect((await call("/api/records")).status).toBe(404);
  });
});
