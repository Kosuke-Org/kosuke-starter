// The bindings and secrets the Worker receives. Keep in step with wrangler.jsonc
// and .dev.vars.example.
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  /** Optional. Defaults to the request's origin. */
  BETTER_AUTH_URL?: string;
};

export type AppEnv = { Bindings: Env };
