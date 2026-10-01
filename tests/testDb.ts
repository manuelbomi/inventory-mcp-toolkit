// Shared test fixture: an in-memory SQLite database with a small, fully
// controlled dataset. Deliberately separate from src/data/seed.ts — that
// seed is for demoing the server interactively and can grow/change
// without needing to update every test's expectations. This fixture is
// the opposite: minimal and stable, so tests assert exact numbers.
import { openDb } from "../src/db.js";
import type { DatabaseSync } from "node:sqlite";

export function createTestDb(): DatabaseSync {
  const db = openDb({ path: ":memory:" });

  db.exec(`
    INSERT INTO suppliers (id, name, contact_email, lead_time_days) VALUES
      (1, 'Test Supplier A', 'a@example.test', 5),
      (2, 'Test Supplier B', 'b@example.test', 14);

    INSERT INTO warehouses (id, code, name, city, state) VALUES
      (1, 'WH-ONE', 'Warehouse One', 'Townsville', 'TS'),
      (2, 'WH-TWO', 'Warehouse Two', 'Cityburg', 'CB');

    INSERT INTO items (id, sku, name, category, unit_cost, unit_price, supplier_id) VALUES
      (1, 'TST-0001', 'Widget', 'Widgets', 1.00, 2.50, 1),
      (2, 'TST-0002', 'Gadget', 'Gadgets', 3.00, 7.00, 2),
      (3, 'TST-0003', 'Gizmo',  'Gadgets', 2.00, 5.00, 2);

    -- Widget @ WH-ONE: healthy. Widget @ WH-TWO: below threshold (low stock).
    -- Gadget @ WH-ONE: below threshold. Gizmo: only stocked at WH-TWO, healthy.
    INSERT INTO stock_levels (item_id, warehouse_id, quantity_on_hand, reorder_threshold, reorder_quantity) VALUES
      (1, 1, 100, 20, 50),
      (1, 2, 5,   20, 50),
      (2, 1, 3,   10, 40),
      (3, 2, 60,  15, 30);
  `);

  return db;
}
