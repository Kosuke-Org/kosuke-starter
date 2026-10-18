// One smoke test over the real Worker app with a real database: the local
// libSQL server, migrations applied from migrations/ (see setup-db.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../worker";
import type { Env } from "../worker/env";
import { setupDb } from "./setup-db";

let db: Awaited<ReturnType<typeof setupDb>>;
let env: Env;

beforeAll(async () => {
  db = await setupDb();
  env = db.env;
});

afterAll(() => db?.close());

const call = (path: string, init?: RequestInit, base = "http://localhost") =>
  app.request(`${base}${path}`, init, env);

describe("smoke", () => {
  it("answers /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
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

  it("uses __Host- session cookies over https", async () => {
    const base = "https://notes.kosuke.app";
    const json = { "content-type": "application/json", origin: base };
    const signUp = await call(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: json,
        body: JSON.stringify({ email: "b@example.com", password: "password123", name: "B" }),
      },
      base,
    );
    expect(signUp.status).toBe(200);
    const setCookie = signUp.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^__Host-better-auth\.session_token=/);
    expect(setCookie).toMatch(/; Secure/i);
    expect(setCookie).toMatch(/; Path=\//i);
    expect(setCookie).not.toMatch(/; Domain=/i);

    const cookie = setCookie.split(";")[0];
    const session = await call("/api/auth/get-session", { headers: { cookie } }, base);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe("b@example.com");

    // The browser drops an expiry for a __Host- cookie that lacks Secure.
    const signOut = await call("/api/auth/sign-out", { method: "POST", headers: { ...json, cookie } }, base);
    expect(signOut.status).toBe(200);
    const cleared = signOut.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/^__Host-better-auth\.session_token=;/);
    expect(cleared).toMatch(/; Secure/i);
    expect(cleared).not.toMatch(/; Domain=/i);
  });
});
