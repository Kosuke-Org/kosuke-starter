# Recipe: file uploads (Cloudflare R2)

Use when people upload files (images, documents). R2 is Cloudflare's object storage; do not use S3.

1. Add an R2 binding to `wrangler.jsonc`:
   ```jsonc
   "r2_buckets": [{ "binding": "FILES", "bucket_name": "<app>-files" }]
   ```
   and `FILES: R2Bucket` to `worker/env.ts`. Wrangler simulates R2 locally in dev.
2. Upload: `POST /api/files` reads `await c.req.formData()`, takes the `File`, checks its size and type, and writes it with `await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } })`. Generate the key on the server (`crypto.randomUUID()`), never from the file name.
3. Record the file in a D1 table (key, owner, name, size, type) so it can be listed and deleted.
4. Download: `GET /api/files/:key` reads `await c.env.FILES.get(key)`, checks the caller may see it, and returns `new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream" } })`.
5. Workers accept request bodies up to 100 MB. For larger files, use R2 multipart uploads.
