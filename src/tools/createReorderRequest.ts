// Tool: create_reorder_request
//
// This is the one write-path tool in the toolkit — worth extra scrutiny
// since, unlike the read tools, a bug here mutates data. It validates both
// the SKU and warehouse exist (and that a stock_levels row links them)
// before inserting, and defaults the quantity to the configured
// `reorder_quantity` so a caller doesn't have to know that number.
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { NotFoundError } from "../errors.js";

export const name = "create_reorder_request";

export const description =
  "Create a reorder request for a SKU at a specific warehouse. If quantity is " +
  "omitted, defaults to that stock line's configured reorder_quantity. Returns " +
  "the created request record.";

export const inputSchema = {
  sku: z.string().trim().min(1).describe("SKU to reorder, e.g. 'FN-1001'."),
  warehouse_code: z.string().trim().min(1).describe("Destination warehouse code, e.g. 'WH-EAST'."),
  quantity: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Units to reorder. Defaults to the stock line's reorder_quantity if omitted."),
  note: z.string().trim().max(500).optional().describe("Optional free-text note, e.g. a reason or requester."),
};

export interface CreateReorderRequestArgs {
  sku: string;
  warehouse_code: string;
  quantity?: number | undefined;
  note?: string | undefined;
}

export interface ReorderRequestConfirmation {
  id: number;
  sku: string;
  warehouse_code: string;
  quantity_requested: number;
  status: string;
  requested_at: string;
  note: string | null;
}

interface StockLineRow {
  item_id: number;
  warehouse_id: number;
  reorder_quantity: number;
}

export function createReorderRequest(
  db: DatabaseSync,
  args: CreateReorderRequestArgs,
): ReorderRequestConfirmation {
  const stockLine = db
    .prepare(
      `SELECT s.item_id, s.warehouse_id, s.reorder_quantity
       FROM stock_levels s
       JOIN items i ON i.id = s.item_id
       JOIN warehouses w ON w.id = s.warehouse_id
       WHERE i.sku = ? AND w.code = ?`,
    )
    .get(args.sku, args.warehouse_code) as StockLineRow | undefined;

  if (!stockLine) {
    throw new NotFoundError(
      `No stock record links SKU "${args.sku}" to warehouse "${args.warehouse_code}". ` +
        "Double-check both values with search_inventory / get_warehouse_summary.",
    );
  }

  const quantity = args.quantity ?? stockLine.reorder_quantity;

  const result = db
    .prepare(
      `INSERT INTO reorder_requests (item_id, warehouse_id, quantity_requested, note)
       VALUES (?, ?, ?, ?)`,
    )
    .run(stockLine.item_id, stockLine.warehouse_id, quantity, args.note ?? null);

  const created = db
    .prepare("SELECT id, status, requested_at, note FROM reorder_requests WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as { id: number; status: string; requested_at: string; note: string | null };

  return {
    id: created.id,
    sku: args.sku,
    warehouse_code: args.warehouse_code,
    quantity_requested: quantity,
    status: created.status,
    requested_at: created.requested_at,
    note: created.note,
  };
}
