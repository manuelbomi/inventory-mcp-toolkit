// Tool: search_inventory
//
// The handler is exported separately from the Zod shape so it can be unit
// tested directly against a DatabaseSync instance, without going through
// the MCP protocol layer at all (see tests/tools.test.ts).
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";

export const name = "search_inventory";

export const description =
  "Search the inventory catalog by item name, SKU, or category substring. " +
  "Returns matching items with their total quantity on hand across all warehouses.";

// Using a Zod *shape* (plain object of schemas) rather than z.object(...)
// because that's what McpServer.registerTool expects for inputSchema — it
// builds the object schema and the JSON Schema sent to clients for you.
export const inputSchema = {
  query: z
    .string()
    .trim()
    .min(1, "query must not be empty")
    .describe("Free-text search term matched against item name and SKU."),
  category: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional exact category filter, e.g. 'Electronics'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of results to return (default 20, max 100)."),
};

export interface SearchInventoryArgs {
  query: string;
  category?: string | undefined;
  limit: number;
}

export interface SearchResultRow {
  sku: string;
  name: string;
  category: string;
  unit_price: number;
  total_quantity_on_hand: number;
}

export function searchInventory(db: DatabaseSync, args: SearchInventoryArgs): SearchResultRow[] {
  const like = `%${args.query}%`;

  const sql = `
    SELECT
      i.sku,
      i.name,
      i.category,
      i.unit_price,
      COALESCE(SUM(s.quantity_on_hand), 0) AS total_quantity_on_hand
    FROM items i
    LEFT JOIN stock_levels s ON s.item_id = i.id
    WHERE (i.name LIKE ? OR i.sku LIKE ?)
      ${args.category ? "AND i.category = ?" : ""}
    GROUP BY i.id
    ORDER BY i.name
    LIMIT ?
  `;

  const params: Array<string | number> = args.category
    ? [like, like, args.category, args.limit]
    : [like, like, args.limit];

  return db.prepare(sql).all(...params) as unknown as SearchResultRow[];
}
