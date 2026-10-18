import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

/* ---------- Better Auth tables (do not rename columns) ---------- */

export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: id(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable("account", {
  id: id(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
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
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------- App tables ---------- */

// The app's data: one row per record, its fields in `data`, a JSON object the
// app shapes as it likes. People edit records through /api/records; Crons
// write the same rows straight through SQL, so every default lives in SQL too:
//   INSERT INTO records (data) VALUES (json_object('text', 'Hello'));
//   UPDATE records SET data = json_set(data, '$.done', json('true')) WHERE id = ?;
// A trigger (migrations/0002_records_updated_at.sql) moves updated_at forward
// on every update, including those that do not set it.
export const records = sqliteTable(
  "records",
  {
    id: text("id")
      .primaryKey()
      .default(sql`(lower(hex(randomblob(16))))`),
    data: text("data", { mode: "json" })
      .$type<RecordData>()
      .notNull()
      .default(sql`'{}'`),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: createdAt(),
    // Stamped in SQL, by nextUpdatedAt below or by the trigger above.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("records_sort_order_idx").on(t.sortOrder, t.createdAt),
    check("records_data_is_object", sql`json_valid(data) AND json_type(data) = 'object'`),
  ],
);

/**
 * The time an update stamps on updated_at: now in ms, and always later than
 * before. The trigger uses the same expression for updates that do not set it.
 */
export const nextUpdatedAt = sql`max(CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), ${sql.identifier("updated_at")} + 1)`;

/** A record's fields. Numbers are IEEE doubles, as JSON.parse reads them. */
export type RecordData = Record<string, unknown>;
export type AppRecord = typeof records.$inferSelect;
