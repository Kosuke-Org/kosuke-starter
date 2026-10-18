# Recipe: AI features

Use when the app calls a language model.

1. Call the provider's HTTP API with `fetch` from the Worker; no SDK is needed. For Anthropic: `POST https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
2. Add the API key to `worker/env.ts` and `.dev.vars.example`. Never call the provider from the browser: the key would leak.
3. Put the call in one function, `worker/ai.ts`, with the prompt as a constant beside it.
4. For streaming, pass `"stream": true` and return the provider's body to the client as is: `return new Response(res.body, { headers: { "content-type": "text/event-stream" } })`. Read it in the client with `fetch` and a `ReadableStream` reader.
5. Rate-limit per user (for example a table of calls per day) before the app is public: each call costs money.
