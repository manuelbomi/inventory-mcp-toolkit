// Schema for the warehouse/inventory demo database.
//
// This lives as a template string (rather than a .sql file read off disk)
// on purpose: `tsc` doesn't copy non-TS assets into dist/, and we'd rather
// not add a separate copy-files build step for a handful of statements.
// Keeping the schema here means `npm run build` just works with plain tsc.
//
// Kept deliberately small (five tables) so the whole domain fits in your
// head while still being realistic enough to support meaningful queries.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS suppliers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  contact_email  TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL DEFAULT 7
);

CREATE TABLE IF NOT EXISTS warehouses (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  code  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  city  TEXT NOT NULL,
  state TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  unit_cost   REAL NOT NULL,
  unit_price  REAL NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id)
);

-- One row per (item, warehouse) pair: how much of this SKU sits in that
-- warehouse, and the threshold below which it should be reordered.
CREATE TABLE IF NOT EXISTS stock_levels (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id           INTEGER NOT NULL REFERENCES items(id),
  warehouse_id      INTEGER NOT NULL REFERENCES warehouses(id),
  quantity_on_hand  INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER NOT NULL DEFAULT 10,
  reorder_quantity  INTEGER NOT NULL DEFAULT 50,
  UNIQUE (item_id, warehouse_id)
);

-- Append-only log of reorder requests created by the create_reorder_request
-- tool. A real system would push this into a purchasing workflow; here it's
-- just a durable record you can query back.
CREATE TABLE IF NOT EXISTS reorder_requests (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id            INTEGER NOT NULL REFERENCES items(id),
  warehouse_id       INTEGER NOT NULL REFERENCES warehouses(id),
  quantity_requested INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  requested_at       TEXT NOT NULL DEFAULT (datetime('now')),
  note               TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_levels(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock_levels(warehouse_id);
`;
