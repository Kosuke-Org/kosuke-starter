import { Hono } from "hono";
import type { AppEnv } from "./env";

// One chain, so the client's typed `hc` sees every route. Add a route by
// writing worker/routes/<name>.ts and mounting it here with .route(), as the
// README's "Add a table and CRUD endpoints" recipe shows.
const app = new Hono<AppEnv>().get("/health", (c) => c.json({ ok: true }));

export type AppType = typeof app;
export default app;
