# Recipe: background jobs (Cloudflare Queues and Cron Triggers)

Use when work should happen outside a request: retries, slow tasks, scheduled tasks. Workers have no long-running process, so do not add Redis, BullMQ or a worker process.

**Short work after the response:** `c.executionCtx.waitUntil(promise)`. No setup. No retry.

**Work that must retry: Queues.**
1. In `wrangler.jsonc`:
   ```jsonc
   "queues": {
     "producers": [{ "binding": "JOBS", "queue": "<app>-jobs" }],
     "consumers": [{ "queue": "<app>-jobs", "max_retries": 5 }]
   }
   ```
   and `JOBS: Queue<Job>` in `worker/env.ts`, with `type Job` a small JSON shape.
2. Send: `await c.env.JOBS.send({ type: "welcome-email", userId })`.
3. Consume: change `worker/index.ts` to export `{ fetch: app.fetch, async queue(batch, env) { for (const m of batch.messages) { await handle(m.body, env); m.ack(); } } }`. A thrown error retries the message.
4. Keep each job idempotent: it may run more than once.

**Work on a schedule: Cron Triggers.**
1. In `wrangler.jsonc`: `"triggers": { "crons": ["0 * * * *"] }`.
2. Export `scheduled(controller, env, ctx)` beside `fetch` and do the work there.
