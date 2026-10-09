import { hc } from "hono/client";
import type { AppType } from "../../worker";

// Typed client for the Worker's routes. Same origin, so no base URL.
export const api = hc<AppType>("/");
