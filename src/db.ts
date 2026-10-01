// Database connection helper.
//
// We use Node's built-in `node:sqlite` module instead of a third-party
// driver like better-sqlite3. As of Node 22.5+ it ships in core, is
// synchronous (no async/await ceremony for simple queries, same ergonomics
// as better-sqlite3), and needs no native build toolchain — which matters
// for a repo meant to `npm install` cleanly on a fresh machine without
// Python/C++ build tools on PATH. The tradeoff: it's newer and the API
// surface is smaller, but everything this project needs (prepared
// statements, transactions via exec) is covered.
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { SCHEMA_SQL } from "./data/schema.js";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_DB_PATH = path.join(PROJECT_ROOT, "data", "inventory.db");

export interface OpenDbOptions {
  /** Path to the SQLite file. Defaults to data/inventory.db at repo root. */
  path?: string;
  /** Run CREATE TABLE IF NOT EXISTS for all tables before returning. */
  ensureSchema?: boolean;
}

/**
 * Opens (and optionally initializes) the inventory database.
 * Callers are responsible for calling `.close()` when done — the MCP server
 * keeps one connection open for its lifetime; tests typically use
 * `:memory:` and close per-test.
 */
export function openDb(options: OpenDbOptions = {}): DatabaseSync {
  const dbPath = options.path ?? DEFAULT_DB_PATH;

  // The data/ directory isn't guaranteed to exist yet — it holds only the
  // generated database file (gitignored), so a fresh clone or CI checkout
  // won't have it. node:sqlite doesn't create parent directories for you.
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Reasonable defaults for a small local tool: enforce FKs (the schema
  // relies on them for referential sanity) and use WAL so a reader (the
  // client) doesn't block a concurrent writer (a reorder request).
  db.exec("PRAGMA foreign_keys = ON;");
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  if (options.ensureSchema ?? true) {
    db.exec(SCHEMA_SQL);
  }

  return db;
}
