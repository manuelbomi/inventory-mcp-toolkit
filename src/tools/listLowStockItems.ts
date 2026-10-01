// Tool: list_low_stock_items
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { LowStockEntry } from "../types.js";

export const name = "list_low_stock_items";

export const description =
  "List every (item, warehouse) combination where quantity on hand has fallen " +
  "below its reorder threshold — the day-to-day 'what needs reordering' view. " +
  "Optionally narrow by warehouse code or category.";

export const inputSchema = {
  warehouse_code: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional warehouse code filter, e.g. 'WH-EAST'."),
  category: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional category filter, e.g. 'Fasteners'."),
};

export interface ListLowStockItemsArgs {
  warehouse_code?: string | undefined;
  category?: string | undefined;
}

export function listLowStockItems(db: DatabaseSync, args: ListLowStockItemsArgs): LowStockEntry[] {
  const conditions: string[] = ["s.quantity_on_hand < s.reorder_threshold"];
  const params: string[] = [];

  if (args.warehouse_code) {
    conditions.push("w.code = ?");
    params.push(args.warehouse_code);
  }
  if (args.category) {
    conditions.push("i.category = ?");
    params.push(args.category);
  }

  const sql = `
    SELECT
      i.sku,
      i.name AS item_name,
      i.category,
      w.code AS warehouse_code,
      w.name AS warehouse_name,
      s.quantity_on_hand,
      s.reorder_threshold,
      s.reorder_quantity,
      sup.name AS supplier_name,
      sup.contact_email AS supplier_email,
      sup.lead_time_days
    FROM stock_levels s
    JOIN items i ON i.id = s.item_id
    JOIN warehouses w ON w.id = s.warehouse_id
    JOIN suppliers sup ON sup.id = i.supplier_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY (s.reorder_threshold - s.quantity_on_hand) DESC
  `;

  return db.prepare(sql).all(...params) as unknown as LowStockEntry[];
}
