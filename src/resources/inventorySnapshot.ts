// Resource: inventory://snapshot
//
// Resources are MCP's read-only counterpart to tools: instead of a model
// deciding to call a function with arguments, a client can just fetch this
// URI to get a point-in-time view of the whole inventory — handy for
// grounding a conversation ("here's the current state") without spending a
// tool call. We compute it fresh from the database on every read rather
// than caching, since staleness would be actively misleading for an
// inventory system.
import type { DatabaseSync } from "node:sqlite";

export const uri = "inventory://snapshot";
export const resourceName = "inventory-snapshot";

export const metadata = {
  title: "Live Inventory Snapshot",
  description:
    "A point-in-time JSON snapshot of every item, its stock across warehouses, " +
    "and whether it is currently below its reorder threshold.",
  mimeType: "application/json",
};

interface SnapshotRow {
  sku: string;
  name: string;
  category: string;
  warehouse_code: string;
  quantity_on_hand: number;
  reorder_threshold: number;
  is_low_stock: 0 | 1;
}

export interface InventorySnapshot {
  generated_at: string;
  item_count: number;
  warehouse_count: number;
  low_stock_count: number;
  rows: SnapshotRow[];
}

export function buildSnapshot(db: DatabaseSync): InventorySnapshot {
  const rows = db
    .prepare(
      `SELECT
         i.sku,
         i.name,
         i.category,
         w.code AS warehouse_code,
         s.quantity_on_hand,
         s.reorder_threshold,
         (s.quantity_on_hand < s.reorder_threshold) AS is_low_stock
       FROM stock_levels s
       JOIN items i ON i.id = s.item_id
       JOIN warehouses w ON w.id = s.warehouse_id
       ORDER BY i.sku, w.code`,
    )
    .all() as unknown as SnapshotRow[];

  const { warehouseCount } = db
    .prepare("SELECT COUNT(*) AS warehouseCount FROM warehouses")
    .get() as { warehouseCount: number };

  return {
    generated_at: new Date().toISOString(),
    item_count: new Set(rows.map((r) => r.sku)).size,
    warehouse_count: warehouseCount,
    low_stock_count: rows.filter((r) => r.is_low_stock).length,
    rows,
  };
}
