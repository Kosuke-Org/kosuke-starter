// The local libSQL server that stands in for Turso in dev and tests.
import { createClient } from "@libsql/client/web";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLocalDb, type LocalDb } from "../scripts/local-db/server";

let dir: string;
let server: LocalDb;
const client = () => createClient({ url: server.url });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kosuke-local-db-"));
  server = await startLocalDb(join(dir, "test.db"));
  await client().execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
});

afterAll(async () => {
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

const count = async () => Number((await client().execute("SELECT count(*) AS n FROM t")).rows[0].n);

describe("local libSQL server", () => {
  it("returns typed values, affected rows and the last rowid", async () => {
    const res = await client().execute({ sql: "INSERT INTO t (v) VALUES (?) RETURNING id, v, 1.5 AS f, x'0102' AS b", args: ["a"] });
    expect(res.rowsAffected).toBe(1);
    expect(res.rows[0].v).toBe("a");
    expect(res.rows[0].f).toBe(1.5);
    expect(new Uint8Array(res.rows[0].b as ArrayBuffer)).toEqual(new Uint8Array([1, 2]));
    expect(res.lastInsertRowid).toBe(BigInt(Number(res.rows[0].id)));
    await client().execute("DELETE FROM t");
  });

  it("rolls back a whole batch when one statement fails", async () => {
    await expect(client().batch(["INSERT INTO t (id, v) VALUES (1, 'x')", "INSERT INTO t (id, v) VALUES (1, 'dup')"], "write")).rejects.toThrow(
      /UNIQUE/,
    );
    expect(await count()).toBe(0);
  });

  it("keeps other streams out of an open transaction until it ends", async () => {
    const tx = await client().transaction("write");
    await tx.execute("INSERT INTO t (v) VALUES ('in tx')");
    let seen: number | undefined;
    const reader = count().then((n) => (seen = n));
    await new Promise((r) => setTimeout(r, 100));
    expect(seen).toBeUndefined();
    await tx.rollback();
    await reader;
    expect(seen).toBe(0);
  });

  it("rolls back a transaction whose stream closes", async () => {
    const tx = await client().transaction("write");
    await tx.execute("INSERT INTO t (v) VALUES ('lost')");
    tx.close();
    expect(await count()).toBe(0);
  });

  it("turns foreign keys back on after a stream turns them off", async () => {
    await client().execute("PRAGMA foreign_keys = OFF");
    const res = await client().execute("PRAGMA foreign_keys");
    expect(Number(res.rows[0].foreign_keys)).toBe(1);
  });
});
