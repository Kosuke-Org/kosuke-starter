// A local libSQL server for dev and tests, so the app runs with no Turso account.
//
// The Worker talks to its database through `@libsql/client/web`, which speaks
// only HTTP (Hrana over HTTP) and cannot open a `file:` database, and `workerd`
// has no file system anyway. So when TURSO_DATABASE_URL is not set, the dev
// tooling starts this server over a SQLite file and points the Worker at it.
// It implements the subset of Hrana v2 (JSON pipeline) that the client uses:
// https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_2_SPEC.md
//
// It runs in Node or Bun, never in the Worker, and is never part of `vite build`.
import Database from "libsql";
import { mkdirSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";

export type LocalDb = { url: string; close: () => Promise<void> };

type Value =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };
type Stmt = {
  sql?: string;
  sql_id?: number;
  args?: Value[];
  named_args?: { name: string; value: Value }[];
  want_rows?: boolean;
};
type Cond =
  | { type: "ok" | "error"; step: number }
  | { type: "not"; cond: Cond }
  | { type: "and" | "or"; conds: Cond[] }
  | { type: "is_autocommit" };
type StreamRequest =
  | { type: "close" }
  | { type: "execute"; stmt: Stmt }
  | { type: "batch"; batch: { steps: { condition?: Cond; stmt: Stmt }[] } }
  | { type: "sequence"; sql?: string; sql_id?: number }
  | { type: "describe" }
  | { type: "store_sql"; sql_id: number; sql: string }
  | { type: "close_sql"; sql_id: number }
  | { type: "get_autocommit" };
type HranaError = { message: string; code?: string };
type StmtResult = {
  cols: { name: string; decltype: string | null }[];
  rows: Value[][];
  affected_row_count: number;
  last_insert_rowid: string | null;
};

type Stream = { baton: string; sqls: Map<number, string>; timer?: ReturnType<typeof setTimeout> };

/** A stream left idle this long is closed, and its open transaction rolled back. */
const STREAM_IDLE_MS = 10_000;

/** Starts the server over `file` on 127.0.0.1, on `port` or a free one. */
export async function startLocalDb(file: string, port = 0): Promise<LocalDb> {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");

  // One connection, shared by every stream. A stream that ends a pipeline inside
  // a transaction keeps the lock, so no other stream's statement can land in its
  // transaction; the others wait until it commits, rolls back, closes or idles out.
  const streams = new Map<string, Stream>();
  let owner: Stream | undefined;
  let waiters: (() => void)[] = [];

  const release = () => {
    owner = undefined;
    const next = waiters;
    waiters = [];
    next.forEach((wake) => wake());
  };
  const acquire = async (stream: Stream) => {
    while (owner && owner !== stream) await new Promise<void>((wake) => waiters.push(wake));
  };
  const closeStream = (stream: Stream) => {
    clearTimeout(stream.timer);
    streams.delete(stream.baton);
    if (owner === stream && db.inTransaction) db.exec("ROLLBACK");
    // The connection is shared: undo a stream's `PRAGMA foreign_keys = OFF`
    // (as libSQL's migrate() sends) before the next stream runs.
    if (!db.inTransaction) db.exec("PRAGMA foreign_keys = ON");
    if (owner === stream) release();
  };

  async function pipeline(body: { baton?: string | null; requests: StreamRequest[] }) {
    let stream: Stream;
    if (body.baton) {
      const found = streams.get(body.baton);
      if (!found) throw new HttpError(400, "The stream has expired or does not exist");
      stream = found;
    } else {
      stream = { baton: crypto.randomUUID(), sqls: new Map() };
      streams.set(stream.baton, stream);
    }
    clearTimeout(stream.timer);
    await acquire(stream);

    let closed = false;
    const results = body.requests.map((request) => {
      if (closed) return { type: "error", error: { message: "The stream is closed" } };
      try {
        if (request.type === "close") closed = true;
        return { type: "ok", response: handle(stream, request) };
      } catch (e) {
        return { type: "error", error: toError(e) };
      }
    });

    if (closed) {
      closeStream(stream);
      return { baton: null, base_url: null, results };
    }
    if (db.inTransaction) owner = stream;
    else {
      db.exec("PRAGMA foreign_keys = ON");
      if (owner === stream) release();
    }
    stream.timer = setTimeout(() => closeStream(stream), STREAM_IDLE_MS);
    return { baton: stream.baton, base_url: null, results };
  }

  function handle(stream: Stream, request: StreamRequest) {
    switch (request.type) {
      case "close":
        return { type: "close" };
      case "execute":
        return { type: "execute", result: execute(stream, request.stmt) };
      case "batch":
        return { type: "batch", result: batch(stream, request.batch.steps) };
      case "sequence":
        db.exec(sqlOf(stream, request));
        return { type: "sequence" };
      case "store_sql":
        stream.sqls.set(request.sql_id, request.sql);
        return { type: "store_sql" };
      case "close_sql":
        stream.sqls.delete(request.sql_id);
        return { type: "close_sql" };
      case "get_autocommit":
        return { type: "get_autocommit", is_autocommit: !db.inTransaction };
      default:
        throw new Error(`The local database does not support "${request.type}" requests`);
    }
  }

  function execute(stream: Stream, stmt: Stmt): StmtResult {
    const prepared = db.prepare(sqlOf(stream, stmt));
    prepared.safeIntegers(true);
    const named: Record<string, unknown> = {};
    for (const arg of stmt.named_args ?? []) named[arg.name.replace(/^[:@$]/, "")] = fromValue(arg.value);
    const params: unknown[] = (stmt.args ?? []).map(fromValue);
    if (stmt.named_args?.length) params.push(named);

    if (!prepared.reader) {
      const run = prepared.run(...params);
      return {
        cols: [],
        rows: [],
        affected_row_count: Number(run.changes),
        last_insert_rowid: String(run.lastInsertRowid),
      };
    }
    // A reader is a SELECT, a PRAGMA, or a write with RETURNING. Only a write
    // moves total_changes(); then changes() is this statement's own count.
    const before = totalChanges();
    const cols = prepared.columns().map((c) => ({ name: c.name, decltype: c.type }));
    const rows = (prepared.raw(true).all(...params) as unknown[][]).map((row) => row.map(toValue));
    let affected = 0;
    let lastInsertRowid: string | null = null;
    if (totalChanges() !== before) {
      const [changes, rowid] = db.prepare("SELECT changes(), last_insert_rowid()").raw(true).get() as [number, number];
      affected = Number(changes);
      lastInsertRowid = String(rowid);
    }
    return {
      cols,
      rows: stmt.want_rows === false ? [] : rows,
      affected_row_count: affected,
      last_insert_rowid: lastInsertRowid,
    };
  }

  function batch(stream: Stream, steps: { condition?: Cond; stmt: Stmt }[]) {
    const step_results: (StmtResult | null)[] = steps.map(() => null);
    const step_errors: (HranaError | null)[] = steps.map(() => null);
    const holds = (cond: Cond): boolean => {
      switch (cond.type) {
        case "ok":
          return step_results[cond.step] !== null;
        case "error":
          return step_errors[cond.step] !== null;
        case "not":
          return !holds(cond.cond);
        case "and":
          return cond.conds.every(holds);
        case "or":
          return cond.conds.some(holds);
        case "is_autocommit":
          return !db.inTransaction;
      }
    };
    steps.forEach((step, i) => {
      if (step.condition && !holds(step.condition)) return;
      try {
        step_results[i] = execute(stream, step.stmt);
      } catch (e) {
        step_errors[i] = toError(e);
      }
    });
    return { step_results, step_errors };
  }

  function sqlOf(stream: Stream, source: { sql?: string; sql_id?: number }) {
    if (source.sql !== undefined) return source.sql;
    const sql = source.sql_id === undefined ? undefined : stream.sqls.get(source.sql_id);
    if (sql === undefined) throw new Error("Unknown sql_id");
    return sql;
  }

  function totalChanges() {
    return Number(db.prepare("SELECT total_changes()").raw(true).pluck().get());
  }

  const server = createServer((req, res) => {
    route(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { message: e instanceof Error ? e.message : String(e) });
    });
  });

  async function route(req: IncomingMessage, res: ServerResponse) {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && (path === "/" || path === "/v2")) return send(res, 200, { ok: true });
    if (req.method === "POST" && path === "/v2/pipeline") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return send(res, 200, await pipeline(body));
    }
    // 404 on /v3 and /v3-protobuf makes the client fall back to v2.
    send(res, 404, { message: "Not found" });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const { port: bound } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${bound}`,
    close: async () => {
      for (const stream of [...streams.values()]) closeStream(stream);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function toError(e: unknown): HranaError {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "string" ? { message: e.message, code } : { message: e.message };
  }
  return { message: String(e) };
}

function fromValue(value: Value): unknown {
  switch (value.type) {
    case "null":
      return null;
    case "integer":
      return BigInt(value.value);
    case "float":
      return value.value;
    case "text":
      return value.value;
    case "blob":
      return Buffer.from(value.base64, "base64");
  }
}

function toValue(value: unknown): Value {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "bigint") return { type: "integer", value: value.toString() };
  if (typeof value === "number") return { type: "float", value };
  if (typeof value === "string") return { type: "text", value };
  if (value instanceof Uint8Array) return { type: "blob", base64: Buffer.from(value).toString("base64") };
  return { type: "text", value: String(value) };
}
