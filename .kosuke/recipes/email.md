# Recipe: sending email

Use when the app sends email (receipts, invitations, password reset).

1. Use a provider with an HTTP API and call it with `fetch` from the Worker. Resend is the simplest: `POST https://api.resend.com/emails` with `Authorization: Bearer ${c.env.RESEND_API_KEY}` and a JSON body `{ from, to, subject, html }`. No SDK needed.
2. Add the key to `worker/env.ts` and `.dev.vars.example`.
3. Put sending in one function, `worker/email.ts`, so every caller goes through it.
4. For password reset, set `sendResetPassword` in `emailAndPassword` in `worker/auth.ts` to call that function.
5. Sending is slow and can fail. If a request should not wait for it, use `c.executionCtx.waitUntil(send(...))`, or a Queue (see `background-jobs.md`) when it must retry.
6. In development, log the email instead of sending it when the key is not set.
