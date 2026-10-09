// One smoke test over the real Worker app with a real local D1 (through
// Wrangler's platform proxy), migrations applied from migrations/.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import app from "../worker";
import type { Env } from "../worker/env";

let proxy: PlatformProxy<Env>;
let env: Env;

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: false });
  env = { ...proxy.env, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long" };
  const migrations = import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  for (const file of Object.keys(migrations).sort()) {
    const statements = migrations[file]
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }
});

afterAll(() => proxy?.dispose());

const call = (path: string, init?: RequestInit) =>
  app.request(`http://localhost${path}`, init, env);

describe("smoke", () => {
  it("answers /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("writes and reads the example table", async () => {
    const post = await call("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(post.status).toBe(201);
    const list = (await (await call("/api/notes")).json()) as { text: string }[];
    expect(list.map((n) => n.text)).toContain("hello");
    const bad = await call("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: " " }),
    });
    expect(bad.status).toBe(400);
  });

  it("signs up, reads the session and signs out", async () => {
    const json = { "content-type": "application/json", origin: "http://localhost" };
    const signUp = await call("/api/auth/sign-up/email", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: "a@example.com", password: "password123", name: "A" }),
    });
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toContain("session_token");

    const session = await call("/api/auth/get-session", { headers: { cookie } });
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe("a@example.com");

    const signOut = await call("/api/auth/sign-out", { method: "POST", headers: { ...json, cookie } });
    expect(signOut.status).toBe(200);
    const after = await call("/api/auth/get-session", { headers: { cookie } });
    expect(await after.json()).toBeNull();
  });
});
