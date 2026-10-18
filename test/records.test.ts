// /api/records over the real Worker app and database, plus the SQL a Cron
// sends to the same table.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../worker";
import { setupDb } from "./setup-db";

type Rec = { id: string; data: Record<string, unknown>; sortOrder: number; createdAt: string; updatedAt: string };

let db: Awaited<ReturnType<typeof setupDb>>;
let cookie = "";

const call = (path: string, init: RequestInit = {}, withSession = true) =>
  app.request(
    `http://localhost${path}`,
    {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(withSession ? { cookie } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    },
    db.env,
  );
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const create = async (body: unknown = {}) => (await (await call("/api/records", json("POST", body))).json()) as Rec;
const patch = (id: string, body: unknown) => call(`/api/records/${id}`, json("PATCH", body));
const list = async () => (await (await call("/api/records")).json()) as Rec[];
const sqlRow = async (id: string) =>
  (await db.client.execute({ sql: "SELECT data, updated_at FROM records WHERE id = ?", args: [id] })).rows[0];

beforeAll(async () => {
  db = await setupDb();
  const signUp = await call(
    "/api/auth/sign-up/email",
    { ...json("POST", { email: "r@example.com", password: "password123", name: "R" }), headers: { origin: "http://localhost" } },
    false,
  );
  cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toContain("session_token");
});

afterAll(() => db?.close());

describe("records", () => {
  it("answers 401 to every call without a session", async () => {
    const calls = [
      call("/api/records", {}, false),
      call("/api/records", json("POST", { data: {} }), false),
      call("/api/records/x", json("PATCH", { data: {} }), false),
      call("/api/records/x", { method: "DELETE" }, false),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Sign in first" });
    }
  });

  it("creates records last by default and lists them in order", async () => {
    const a = await create({ data: { text: "a" } });
    const b = await create({ data: { text: "b" } });
    const first = await create({ data: { text: "first" }, sortOrder: -5 });
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
    const empty = await create();
    expect(empty.data).toEqual({});
    const ids = (await list()).map((r) => r.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(a.id));
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(empty.id));
  });

  it("shallow-merges data and stores null", async () => {
    const rec = await create({ data: { a: 1, nested: { x: 1, y: 2 } } });
    let res = await patch(rec.id, { data: { b: 2 } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Rec).data).toEqual({ a: 1, b: 2, nested: { x: 1, y: 2 } });
    res = await patch(rec.id, { data: { a: null, nested: { x: 9 } } });
    expect(((await res.json()) as Rec).data).toEqual({ a: null, b: 2, nested: { x: 9 } });
    res = await patch(rec.id, { sortOrder: 42 });
    const moved = (await res.json()) as Rec;
    expect(moved.sortOrder).toBe(42);
    expect(moved.data).toEqual({ a: null, b: 2, nested: { x: 9 } });
  });

  it("moves updatedAt forward on every update, even within one millisecond", async () => {
    const rec = await create({ data: {} });
    let last = Date.parse(rec.updatedAt);
    for (let i = 0; i < 3; i++) {
      const next = (await (await patch(rec.id, { data: { i } })).json()) as Rec;
      expect(Date.parse(next.updatedAt)).toBeGreaterThan(last);
      last = Date.parse(next.updatedAt);
    }
  });

  it("keeps every key when updates race", async () => {
    const rec = await create({ data: {} });
    const keys = ["k1", "k2", "k3", "k4"];
    const results = await Promise.all(keys.map((k) => patch(rec.id, { data: { [k]: true } })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const stored = (await list()).find((r) => r.id === rec.id);
    expect(stored?.data).toEqual({ k1: true, k2: true, k3: true, k4: true });
  });

  it("refuses bad input and unknown ids", async () => {
    const rec = await create();
    for (const body of [{ data: [1] }, { data: null }, { sortOrder: "1" }, { sortOrder: 1e13 }, {}, []]) {
      expect((await patch(rec.id, body)).status).toBe(400);
    }
    expect((await call("/api/records", json("POST", { data: "text" }))).status).toBe(400);
    expect((await patch("missing", { data: { a: 1 } })).status).toBe(404);
    expect((await patch("missing", { sortOrder: 1 })).status).toBe(404);
  });

  it("deletes a record once", async () => {
    const rec = await create({ data: { text: "bye" } });
    expect((await call(`/api/records/${rec.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await call(`/api/records/${rec.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await list()).some((r) => r.id === rec.id)).toBe(false);
  });

  describe("written by SQL, as a Cron does", () => {
    it("fills the id and defaults, and the API reads the row", async () => {
      const res = await db.client.execute("INSERT INTO records (data) VALUES (json_object('text', 'from cron')) RETURNING id");
      const id = String(res.rows[0].id);
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      const rec = (await list()).find((r) => r.id === id);
      expect(rec?.data).toEqual({ text: "from cron" });
    });

    it("moves updated_at forward on a plain UPDATE, twice in a row", async () => {
      const rec = await create({ data: { n: 0 } });
      const before = Number((await sqlRow(rec.id)).updated_at);
      await db.client.execute({ sql: "UPDATE records SET data = json_set(data, '$.n', 1) WHERE id = ?", args: [rec.id] });
      const once = Number((await sqlRow(rec.id)).updated_at);
      await db.client.execute({ sql: "UPDATE records SET data = json_set(data, '$.n', 2) WHERE id = ?", args: [rec.id] });
      const twice = Number((await sqlRow(rec.id)).updated_at);
      expect(once).toBeGreaterThan(before);
      expect(twice).toBeGreaterThan(once);
    });

    it("keeps a Cron's key when the API merges another one", async () => {
      const rec = await create({ data: { a: 1 } });
      await db.client.execute({ sql: "UPDATE records SET data = json_set(data, '$.cron', 'yes') WHERE id = ?", args: [rec.id] });
      const merged = (await (await patch(rec.id, { data: { a: 2 } })).json()) as Rec;
      expect(merged.data).toEqual({ a: 2, cron: "yes" });
    });

    it("refuses data that is not a JSON object", async () => {
      for (const data of ["'[1]'", "'not json'", "'null'"]) {
        await expect(db.client.execute(`INSERT INTO records (data) VALUES (${data})`)).rejects.toThrow(/CHECK constraint/);
      }
    });
  });
});
