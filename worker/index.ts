import { Hono } from "hono";
import { createAuth } from "./auth";
import type { AppEnv } from "./env";
import { records } from "./routes/records";

// One chain, so the client's typed `hc` sees every route. Add a route by
// writing worker/routes/<name>.ts and mounting it here with .route().
const app = new Hono<AppEnv>()
  .get("/health", (c) => c.json({ ok: true }))
  .on(["GET", "POST"], "/api/auth/*", (c) =>
    createAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw),
  )
  .route("/api/records", records);

export type AppType = typeof app;
export default app;
