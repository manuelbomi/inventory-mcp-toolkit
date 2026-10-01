// Tool: get_warehouse_summary
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { NotFoundError } from "../errors.js";
import type { WarehouseSummary } from "../types.js";

export const name = "get_warehouse_summary";

export const description =
  "Roll up inventory for one warehouse (or all warehouses if none specified): " +
  "distinct SKU count, total units on hand, total inventory value at cost, " +
  "and how many lines are currently below their reorder threshold.";

export const inputSchema = {
  warehouse_code: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional warehouse code, e.g. 'WH-CENTRAL'. Omit to summarize every warehouse."),
};

export interface GetWarehouseSummaryArgs {
  warehouse_code?: string | undefined;
}

export function getWarehouseSummary(
  db: DatabaseSync,
  args: GetWarehouseSummaryArgs,
): WarehouseSummary[] {
  if (args.warehouse_code) {
    const exists = db
      .prepare("SELECT 1 FROM warehouses WHERE code = ?")
      .get(args.warehouse_code);
    if (!exists) {
      throw new NotFoundError(`No warehouse found with code "${args.warehouse_code}".`);
    }
  }

  const sql = `
    SELECT
      w.code AS warehouse_code,
      w.name AS warehouse_name,
      w.city,
      w.state,
      COUNT(DISTINCT s.item_id) AS distinct_skus,
      COALESCE(SUM(s.quantity_on_hand), 0) AS total_units_on_hand,
      COALESCE(SUM(s.quantity_on_hand * i.unit_cost), 0) AS total_inventory_value,
      COALESCE(SUM(CASE WHEN s.quantity_on_hand < s.reorder_threshold THEN 1 ELSE 0 END), 0) AS low_stock_count
    FROM warehouses w
    LEFT JOIN stock_levels s ON s.warehouse_id = w.id
    LEFT JOIN items i ON i.id = s.item_id
    ${args.warehouse_code ? "WHERE w.code = ?" : ""}
    GROUP BY w.id
    ORDER BY w.code
  `;

  const params = args.warehouse_code ? [args.warehouse_code] : [];
  const rows = db.prepare(sql).all(...params) as unknown as WarehouseSummary[];

  // Round currency to cents — SQLite's REAL arithmetic otherwise leaks
  // floating point noise (e.g. 1234.5600000000002) into the response.
  return rows.map((r) => ({ ...r, total_inventory_value: Math.round(r.total_inventory_value * 100) / 100 }));
}
