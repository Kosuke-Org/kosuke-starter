# kosuke-starter

The template Kosuke uses for One Shot projects: a one-page React app and its API in one Cloudflare Worker, with a Turso (libSQL) database ready for when the app needs one.

By default it is a landing page: no sign-in, no tables, no data. Each app adds what it needs with the recipes below.

```bash
bun install
bun run dev
```

See [AGENTS.md](AGENTS.md) for the stack, the commands and where things go.

## What is in it

- **The page:** `src/routes/index.tsx`, with the app name and a light and dark theme switch in `src/routes/__root.tsx`.
- **The API:** a Hono app in `worker/index.ts`, with only `GET /health`. The client calls it through the typed `api` in `src/lib/api.ts`.
- **The database:** Turso through Drizzle, wired up with an empty schema (`worker/db/schema.ts`) and no migrations yet.
- **The UI kit:** shadcn/ui in `src/components/ui/`, themed in `src/index.css`.

## Recipes

Each recipe is a short list of steps an agent or a person can follow. Run `bun run typecheck`, `bun run lint` and `bun run test` after each.

### Add a page

Create `src/routes/<path>.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pricing")({ component: Pricing });

function Pricing() {
  return <div className="mx-auto w-full max-w-xl px-6 py-16">…</div>;
}
```

The dev server regenerates `src/routeTree.gen.ts` (`bun run build` does too); commit it. Link to it with `<Link to="/pricing">`.

### Add an API endpoint

1. Write `worker/routes/<name>.ts` as one chained `new Hono<AppEnv>()`:

   ```ts
   import { Hono } from "hono";
   import type { AppEnv } from "../env";

   export const hello = new Hono<AppEnv>().get("/", (c) => c.json({ message: "Hello" }));
   ```

2. Mount it in `worker/index.ts`, on the same chain, so the client's types see it:

   ```ts
   import { hello } from "./routes/hello";

   const app = new Hono<AppEnv>()
     .get("/health", (c) => c.json({ ok: true }))
     .route("/api/hello", hello);
   ```

3. Call it from the client: `const res = await api.api.hello.$get(); const { message } = await res.json();`

Paths under `/api/`, and `/health`, reach the Worker (`run_worker_first` in `wrangler.jsonc`); anything else is the React app. A new path outside `/api/` needs adding there.

### Add a table and CRUD endpoints

The example is a `notes` table. Rename it to what the app stores.

1. **The table.** In `worker/db/schema.ts` (replace the `export {}`):

   ```ts
   import { sql } from "drizzle-orm";
   import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

   export const notes = sqliteTable("notes", {
     id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
     text: text("text").notNull(),
     createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
     updatedAt: integer("updated_at", { mode: "timestamp_ms" })
       .notNull()
       .default(sql`(unixepoch() * 1000)`)
       .$onUpdate(() => new Date()),
   });
   ```

   Keep defaults in SQL (`default(sql…)`), not only in TypeScript, so a Cron's plain `INSERT` gets them too.

2. **The migration.** `bun run db:generate` writes `migrations/0000_<name>.sql`; `bun run db:migrate` applies it. Commit both the SQL and `migrations/meta/`. Never edit a migration that has been applied; change the schema and generate a new one. Publish applies new migrations to the live database.

3. **The endpoints.** `worker/routes/notes.ts`:

   ```ts
   import { desc, eq } from "drizzle-orm";
   import { Hono } from "hono";
   import { validator } from "hono/validator";
   import { getDb, schema } from "../db";
   import type { AppEnv } from "../env";

   const table = schema.notes;

   const body = validator("json", (value: unknown, c) => {
     const text = (value as { text?: unknown } | null)?.text;
     if (typeof text !== "string" || !text.trim()) return c.json({ error: "text is required" }, 400);
     return { text: text.trim() };
   });

   export const notes = new Hono<AppEnv>()
     .get("/", async (c) => c.json(await getDb(c.env).select().from(table).orderBy(desc(table.createdAt))))
     .post("/", body, async (c) => {
       const [row] = await getDb(c.env).insert(table).values(c.req.valid("json")).returning();
       return c.json(row, 201);
     })
     .patch("/:id", body, async (c) => {
       const [row] = await getDb(c.env)
         .update(table)
         .set(c.req.valid("json"))
         .where(eq(table.id, c.req.param("id")))
         .returning();
       return row ? c.json(row, 200) : c.json({ error: "Not found" }, 404);
     })
     .delete("/:id", async (c) => {
       const [row] = await getDb(c.env)
         .delete(table)
         .where(eq(table.id, c.req.param("id")))
         .returning({ id: table.id });
       return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
     });
   ```

   Mount it in `worker/index.ts`: `import { notes } from "./routes/notes";`, then `.route("/api/notes", notes)` on the chain. Writes that must succeed or fail together go in one `getDb(c.env).batch([...])`.

   These endpoints are open to anyone who has the app's address. To keep them to signed-in people, add sign-in first (next recipe) and guard the route.

4. **The client.** `src/hooks/use-notes.ts`:

   ```ts
   import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
   import { api } from "@/lib/api";

   const queryKey = ["notes"];

   export function useNotes() {
     return useQuery({
       queryKey,
       queryFn: async () => {
         const res = await api.api.notes.$get();
         if (!res.ok) throw new Error("Could not load the notes");
         return res.json();
       },
     });
   }

   export function useAddNote() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: async (text: string) => {
         const res = await api.api.notes.$post({ json: { text } });
         if (!res.ok) throw new Error("Could not add the note");
         return res.json();
       },
       onSuccess: () => queryClient.invalidateQueries({ queryKey }),
     });
   }
   ```

   Update and delete follow the same shape. Delete answers 204 with no body, so do not read its JSON:

   ```ts
   export function useDeleteNote() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: async (id: string) => {
         const res = await api.api.notes[":id"].$delete({ param: { id } });
         if (!res.ok) throw new Error("Could not delete the note");
       },
       onSuccess: () => queryClient.invalidateQueries({ queryKey }),
     });
   }
   ```

   Update calls `api.api.notes[":id"].$patch({ param: { id }, json: { text } })` and can return `res.json()`. Show errors with `toast.error(error.message)` from `sonner`.

5. **A test.** In `test/`, call the Worker with `app.request(url, init, db.env)` over the database from `setupDb()` (see `test/smoke.test.ts`): create, list, update and delete a note.

### Add email sign-in

[Better Auth](https://better-auth.com) with email and password, stored in the app's database.

1. **Install it:** `bun add better-auth@1.7.7`.

2. **Its tables.** Add these to `worker/db/schema.ts`. Better Auth reads them by these names; do not rename the columns. When the schema already has tables, merge the imports with the ones at its top instead of repeating them.

   ```ts
   import { sql } from "drizzle-orm";
   import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

   const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
   const updatedAt = () =>
     integer("updated_at", { mode: "timestamp_ms" })
       .notNull()
       .default(sql`(unixepoch() * 1000)`)
       .$onUpdate(() => new Date());

   export const user = sqliteTable("user", {
     id: text("id").primaryKey(),
     name: text("name").notNull(),
     email: text("email").notNull().unique(),
     emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
     image: text("image"),
     createdAt: createdAt(),
     updatedAt: updatedAt(),
   });

   export const session = sqliteTable("session", {
     id: text("id").primaryKey(),
     expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
     token: text("token").notNull().unique(),
     ipAddress: text("ip_address"),
     userAgent: text("user_agent"),
     userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
     createdAt: createdAt(),
     updatedAt: updatedAt(),
   });

   export const account = sqliteTable("account", {
     id: text("id").primaryKey(),
     accountId: text("account_id").notNull(),
     providerId: text("provider_id").notNull(),
     userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
     accessToken: text("access_token"),
     refreshToken: text("refresh_token"),
     idToken: text("id_token"),
     accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
     refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
     scope: text("scope"),
     password: text("password"),
     createdAt: createdAt(),
     updatedAt: updatedAt(),
   });

   export const verification = sqliteTable("verification", {
     id: text("id").primaryKey(),
     identifier: text("identifier").notNull(),
     value: text("value").notNull(),
     expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
     createdAt: createdAt(),
     updatedAt: updatedAt(),
   });
   ```

   Then `bun run db:generate` and `bun run db:migrate`.

3. **Its secret.** Add `BETTER_AUTH_SECRET: string;` and `BETTER_AUTH_URL?: string;` (optional, it defaults to the request's origin) to `Env` in `worker/env.ts`. Add the line `BETTER_AUTH_SECRET=change-me` to `.dev.vars.example`, then run `bun install`: it adds the variable to `.dev.vars` with a random value, here and in every other checkout. Restart the dev server so the Worker reads it. A published app needs nothing more: Publish gives every Worker its own `BETTER_AUTH_SECRET`.

4. **The server.** `worker/auth.ts`:

   ```ts
   import { betterAuth } from "better-auth";
   import { drizzleAdapter } from "better-auth/adapters/drizzle";
   import { getDb, schema } from "./db";
   import type { Env } from "./env";

   // Published apps share a parent domain, so another app on a sibling
   // subdomain could set a cookie that shadows this app's session. A `__Host-`
   // cookie cannot be set from another subdomain: the browser takes it only
   // with Secure, Path=/ and no Domain. Plain http (local dev) keeps the
   // default names, since `__Host-` needs https.
   function hostOnlyCookies(baseURL: string) {
     if (!baseURL.startsWith("https://")) return {};
     return {
       useSecureCookies: false,
       cookiePrefix: "__Host-better-auth",
       defaultCookieAttributes: { secure: true, path: "/" },
     };
   }

   // One instance per request: bindings only exist inside a request on Workers.
   export function createAuth(env: Env, origin: string) {
     const baseURL = env.BETTER_AUTH_URL ?? origin;
     return betterAuth({
       baseURL,
       secret: env.BETTER_AUTH_SECRET,
       database: drizzleAdapter(getDb(env), { provider: "sqlite", schema }),
       emailAndPassword: { enabled: true },
       advanced: hostOnlyCookies(baseURL),
     });
   }
   ```

   Mount it in `worker/index.ts`, on the chain, and import `createAuth` from `./auth`:

   ```ts
   .on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw))
   ```

   Never turn on Better Auth's `crossSubDomainCookies` and never set a cookie `Domain`.

5. **The client.** `src/lib/auth-client.ts`:

   ```ts
   import { createAuthClient } from "better-auth/react";

   export const authClient = createAuthClient();
   export const { useSession, signIn, signUp, signOut } = authClient;
   ```

6. **The pages.** `src/components/auth-form.tsx`:

   ```tsx
   import { useNavigate } from "@tanstack/react-router";
   import { useState, type FormEvent } from "react";
   import { Button } from "@/components/ui/button";
   import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
   import { Input } from "@/components/ui/input";
   import { Label } from "@/components/ui/label";
   import { signIn, signUp } from "@/lib/auth-client";

   export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
     const navigate = useNavigate();
     const [error, setError] = useState<string | null>(null);
     const [busy, setBusy] = useState(false);

     async function onSubmit(e: FormEvent<HTMLFormElement>) {
       e.preventDefault();
       const form = new FormData(e.currentTarget);
       const email = String(form.get("email"));
       const password = String(form.get("password"));
       setBusy(true);
       setError(null);
       const res =
         mode === "sign-up"
           ? await signUp.email({ email, password, name: String(form.get("name") || email) })
           : await signIn.email({ email, password });
       setBusy(false);
       if (res.error) setError(res.error.message ?? "Something went wrong");
       else await navigate({ to: "/" });
     }

     const title = mode === "sign-up" ? "Create an account" : "Sign in";
     return (
       <Card className="mx-auto my-16 w-full max-w-sm">
         <CardHeader>
           <CardTitle>{title}</CardTitle>
         </CardHeader>
         <CardContent>
           <form onSubmit={onSubmit} className="flex flex-col gap-4">
             {mode === "sign-up" && (
               <div className="flex flex-col gap-2">
                 <Label htmlFor="name">Name</Label>
                 <Input id="name" name="name" autoComplete="name" />
               </div>
             )}
             <div className="flex flex-col gap-2">
               <Label htmlFor="email">Email</Label>
               <Input id="email" name="email" type="email" required autoComplete="email" />
             </div>
             <div className="flex flex-col gap-2">
               <Label htmlFor="password">Password</Label>
               <Input
                 id="password"
                 name="password"
                 type="password"
                 required
                 minLength={8}
                 autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
               />
             </div>
             {error && <p className="text-sm text-destructive">{error}</p>}
             <Button type="submit" disabled={busy}>
               {title}
             </Button>
           </form>
         </CardContent>
       </Card>
     );
   }
   ```

   `src/routes/sign-in.tsx`, and `sign-up.tsx` the same with `"/sign-up"` and `mode="sign-up"`:

   ```tsx
   import { createFileRoute } from "@tanstack/react-router";
   import { AuthForm } from "@/components/auth-form";

   export const Route = createFileRoute("/sign-in")({ component: () => <AuthForm mode="sign-in" /> });
   ```

   The running dev server adds both to `src/routeTree.gen.ts`; without one, run `bun run build` before `bun run typecheck`, which otherwise rejects the new paths.

7. **The header.** `src/components/user-menu.tsx`, placed beside `<ThemeToggle />` in `src/routes/__root.tsx` (wrap both in `<div className="flex items-center gap-2">`):

   ```tsx
   import { Link, useRouter } from "@tanstack/react-router";
   import { Button } from "@/components/ui/button";
   import { signOut, useSession } from "@/lib/auth-client";

   export function UserMenu() {
     const { data, isPending } = useSession();
     const router = useRouter();
     if (isPending) return null;
     if (!data) {
       return (
         <Button variant="ghost" size="sm" asChild>
           <Link to="/sign-in">Sign in</Link>
         </Button>
       );
     }
     return (
       <Button
         variant="ghost"
         size="sm"
         onClick={async () => {
           await signOut();
           await router.navigate({ to: "/" });
         }}
       >
         Sign out
       </Button>
     );
   }
   ```

8. **Signed-in-only endpoints.** Put this first on a route's chain; every handler after it then needs a session:

   ```ts
   .use(async (c, next) => {
     const session = await createAuth(c.env, new URL(c.req.url).origin).api.getSession({ headers: c.req.raw.headers });
     if (!session) return c.json({ error: "Sign in first" }, 401);
     await next();
   })
   ```

   For data each person owns, add a `userId` column that references `user.id`, read the session in the handler the same way, and filter every query by `session.user.id`.

9. **Signed-in-only pages.** In the page, read `useSession()`; while `isPending` show a `Skeleton`, and with no session return `<Navigate to="/sign-in" replace />`.

10. **Who can sign up.** Sign-up is open: anyone with the address can make an account. To close it, set `emailAndPassword: { enabled: true, disableSignUp: true }` and drop the sign-up page, or check the email in a `databaseHooks.user.create.before` hook. For password reset email, see `.kosuke/recipes/email.md`.

11. **The tests.** In `test/setup-db.ts`, give the test Worker a secret: `const env = { TURSO_DATABASE_URL: server.url, BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long" } as Env;`. In `test/smoke.test.ts`, delete the cases that expect no sign-in routes (`/api/auth/...` answering 404): they describe the starter without sign-in. Then add a test: sign up through `app.request("https://app.example/api/auth/sign-up/email", …)` with an `origin` header of the same address, and check the `set-cookie` header starts with `__Host-better-auth.session_token=` and has `Secure`, `Path=/` and no `Domain`.

### Let a Cron write app data

The app's Crons write its tables with SQL, beside the people who use the app, and the last write wins. Design a table for that:

- Keep every default in SQL (the `default(sql…)` above), so `INSERT INTO notes (text) VALUES ('Hello')` fills `id` and the timestamps.
- Change single columns rather than whole rows, so a Cron does not undo a person's edit to another column: `UPDATE notes SET text = ? WHERE id = ?`.
- Drizzle's `$onUpdate` only runs for updates made through Drizzle. When a Cron's updates must move `updated_at` too, set it in the SQL: `SET updated_at = unixepoch() * 1000`.
- For a free-form record, a JSON column lets a Cron change one key without touching the others. Add it to the table, then `bun run db:generate` and `bun run db:migrate`:

  ```ts
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  ```

  ```sql
  UPDATE notes SET data = json_set(data, '$.done', json('true')) WHERE id = ?;
  ```

### More

`.kosuke/recipes/` covers payments (Stripe), email, file uploads (R2), AI and background jobs (Queues and Cron Triggers).

## The database

Each app has one Turso database. Dev, the preview and the published Worker all use it, and there is no separate dev database. Two variables say where it is:

| Variable | What it is |
|---|---|
| `TURSO_DATABASE_URL` | The database, such as `libsql://<database>-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | Its auth token |

- **Published Worker:** Kosuke sets both as Worker secrets.
- **`bun run dev`:** they come from `.dev.vars`, then from the environment. `vite.config.ts` passes them to the Worker.
- **Without them:** the app falls back to a local SQLite file, `.data/local.db`, so dev works with no Turso account. `bun run dev` serves that file to the Worker through a small local libSQL server (`scripts/local-db/`), because the Worker reaches its database over HTTP. `vite preview` does not start it. Put the URL in `.dev.vars` to preview a build.

Migrations are SQL files in `migrations/`, generated by drizzle-kit from `worker/db/schema.ts`. The starter has none yet: `migrations/meta/_journal.json` is empty until the first `bun run db:generate`.

| Command | What it does |
|---|---|
| `bun run db:generate` | Writes a migration from the schema |
| `bun run db:migrate` | Applies migrations to the configured database: Turso when `TURSO_DATABASE_URL` is set, `.data/local.db` otherwise |
| `bun run db:migrate:remote` | The same, but fails when no Turso URL is set. `bun run deploy` runs it before it publishes |
