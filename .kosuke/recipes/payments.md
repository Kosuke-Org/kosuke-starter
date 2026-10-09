# Recipe: payments (Stripe)

Use when the app needs to take money.

1. `bun add stripe`. Create the client per request with `new Stripe(c.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() })`. The fetch client is what makes it work on Workers.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to `worker/env.ts` and `.dev.vars.example`.
3. Checkout: a `POST /api/checkout` route creates a Checkout Session and returns its `url`; the client redirects to it. Never trust a price sent by the client; look it up on the server.
4. Webhook: `POST /api/stripe/webhook`. Read the raw body with `await c.req.text()` and verify with `await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider())`. The async variant uses Web Crypto.
5. Record what was paid in a D1 table (for example `payments`, keyed by the Checkout Session id) so a repeated webhook does not double-count.
6. Test with test-mode keys and the Stripe CLI (`stripe listen --forward-to localhost:5173/api/stripe/webhook`).
