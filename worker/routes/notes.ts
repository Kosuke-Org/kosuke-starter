import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { getDb, schema } from "../db";
import type { AppEnv } from "../env";

// The example route: list and add notes. Public on purpose; AGENTS.md shows
// how to require a signed-in user.
export const notes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await getDb(c.env.DB)
      .select()
      .from(schema.notes)
      .orderBy(desc(schema.notes.id))
      .limit(50);
    return c.json(rows);
  })
  .post(
    "/",
    validator("json", (value, c) => {
      const text = typeof value?.text === "string" ? value.text.trim() : "";
      if (!text) return c.json({ error: "text is required" }, 400);
      return { text };
    }),
    async (c) => {
      const { text } = c.req.valid("json");
      const [row] = await getDb(c.env.DB).insert(schema.notes).values({ text }).returning();
      return c.json(row, 201);
    },
  );
