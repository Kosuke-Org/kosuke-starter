// The bindings and secrets the Worker receives. Keep in step with wrangler.jsonc
// and .dev.vars.example.
export type Env = {
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  /** Optional. Defaults to the request's origin. */
  BETTER_AUTH_URL?: string;
  /**
   * The app's Turso database, such as libsql://<db>-<org>.turso.io. A Worker
   * secret in production. In dev, vite.config.ts sets it, to a local server when
   * neither .dev.vars nor the environment has one.
   */
  TURSO_DATABASE_URL: string;
  /** The database's auth token. Not needed for the local server. */
  TURSO_AUTH_TOKEN?: string;
};

export type AppEnv = { Bindings: Env };
