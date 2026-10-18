import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createAuth } from "../auth";
import { getDb, schema } from "../db";
import { nextUpdatedAt, type RecordData } from "../db/schema";
import type { AppEnv } from "../env";

// The app's records: list, create, update (shallow merge into `data`) and
// delete. People reach them here; Crons write the same rows through SQL. The
// last write wins.
//
// Signed-in users only. To make an app's records public, delete the .use()
// guard below: every handler after it then answers without a session.

const table = schema.records;

/** How many times an update re-reads and retries when another writer changed the record meanwhile. */
const MERGE_ATTEMPTS = 5;
/** Keeps `max(sort_order) + 1` exact: doubles stop counting by 1 near 2^53. */
const MAX_SORT_ORDER = 1e12;

type RecordInput = { data?: RecordData; sortOrder?: number };

const isObject = (value: unknown): value is RecordData =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseInput(value: unknown): RecordInput | string {
  if (!isObject(value)) return "The body must be a JSON object";
  const input: RecordInput = {};
  if (value.data !== undefined) {
    if (!isObject(value.data)) return "data must be a JSON object";
    input.data = value.data;
  }
  if (value.sortOrder !== undefined) {
    const n = value.sortOrder;
    if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > MAX_SORT_ORDER) {
      return `sortOrder must be a number between -${MAX_SORT_ORDER} and ${MAX_SORT_ORDER}`;
    }
    input.sortOrder = n;
  }
  return input;
}

const body = (required: boolean) =>
  validator("json", (value, c) => {
    const input = parseInput(value);
    if (typeof input === "string") return c.json({ error: input }, 400);
    if (required && input.data === undefined && input.sortOrder === undefined) {
      return c.json({ error: "Send data, sortOrder or both" }, 400);
    }
    return input;
  });

export const records = new Hono<AppEnv>()
  .use(async (c, next) => {
    const auth = createAuth(c.env, new URL(c.req.url).origin);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Sign in first" }, 401);
    await next();
  })
  .get("/", async (c) => {
    const rows = await getDb(c.env)
      .select()
      .from(table)
      .orderBy(asc(table.sortOrder), asc(table.createdAt), asc(table.id));
    return c.json(rows);
  })
  .post("/", body(false), async (c) => {
    const { data = {}, sortOrder } = c.req.valid("json");
    const [row] = await getDb(c.env)
      .insert(table)
      .values({
        data,
        // Without a sortOrder the record goes last, computed in the same statement.
        sortOrder: sortOrder ?? sql`(SELECT coalesce(max(sort_order), 0) + 1 FROM records)`,
      })
      .returning();
    return c.json(row, 201);
  })
  .patch("/:id", body(true), async (c) => {
    const id = c.req.param("id");
    const { data, sortOrder } = c.req.valid("json");
    const db = getDb(c.env);

    if (data === undefined) {
      const [row] = await db
        .update(table)
        .set({ sortOrder, updatedAt: nextUpdatedAt })
        .where(eq(table.id, id))
        .returning();
      return row ? c.json(row, 200) : c.json({ error: "Record not found" }, 404);
    }

    // Shallow merge, written only if `data` is still what was read, so a
    // Cron's concurrent change to another key is never overwritten. When
    // someone else wrote in between, read again and retry.
    for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
      const [current] = await db
        .select({ raw: sql<string>`cast(${table.data} as text)` })
        .from(table)
        .where(eq(table.id, id));
      if (!current) return c.json({ error: "Record not found" }, 404);

      const merged: RecordData = { ...(JSON.parse(current.raw) as RecordData), ...data };
      const [row] = await db
        .update(table)
        .set({ data: merged, sortOrder, updatedAt: nextUpdatedAt })
        .where(and(eq(table.id, id), sql`${table.data} = ${current.raw}`))
        .returning();
      if (row) return c.json(row, 200);
    }
    return c.json({ error: "The record changed while saving, try again" }, 409);
  })
  .delete("/:id", async (c) => {
    const [row] = await getDb(c.env)
      .delete(table)
      .where(eq(table.id, c.req.param("id")))
      .returning({ id: table.id });
    return row ? c.body(null, 204) : c.json({ error: "Record not found" }, 404);
  });
