// Tool: get_item_by_sku
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { NotFoundError } from "../errors.js";
import type { ItemWithStock } from "../types.js";

export const name = "get_item_by_sku";

export const description =
  "Look up a single item by its exact SKU and return full detail: pricing, " +
  "supplier, and per-warehouse stock levels.";

export const inputSchema = {
  sku: z.string().trim().min(1).describe("Exact SKU, e.g. 'EL-2001'."),
};

export interface GetItemBySkuArgs {
  sku: string;
}

interface ItemRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  supplier_id: number;
  supplier_name: string;
}

interface StockRow {
  warehouse_code: string;
  warehouse_name: string;
  quantity_on_hand: number;
  reorder_threshold: number;
  reorder_quantity: number;
}

export function getItemBySku(db: DatabaseSync, args: GetItemBySkuArgs): ItemWithStock {
  const item = db
    .prepare(
      `SELECT i.*, sup.name AS supplier_name
       FROM items i
       JOIN suppliers sup ON sup.id = i.supplier_id
       WHERE i.sku = ?`,
    )
    .get(args.sku) as ItemRow | undefined;

  if (!item) {
    // Deliberately includes the SKU that was searched for — generic "not
    // found" errors are a common source of frustration for whoever (human
    // or model) is on the other end of this tool call.
    throw new NotFoundError(`No item found with SKU "${args.sku}".`);
  }

  const stock = db
    .prepare(
      `SELECT w.code AS warehouse_code, w.name AS warehouse_name,
              s.quantity_on_hand, s.reorder_threshold, s.reorder_quantity
       FROM stock_levels s
       JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.item_id = ?
       ORDER BY w.code`,
    )
    .all(item.id) as unknown as StockRow[];

  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    unit_cost: item.unit_cost,
    unit_price: item.unit_price,
    supplier_id: item.supplier_id,
    supplier_name: item.supplier_name,
    stock,
  };
}
