import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "./testDb.js";
import { searchInventory } from "../src/tools/searchInventory.js";
import { getItemBySku } from "../src/tools/getItemBySku.js";
import { listLowStockItems } from "../src/tools/listLowStockItems.js";
import { getWarehouseSummary } from "../src/tools/getWarehouseSummary.js";
import { createReorderRequest } from "../src/tools/createReorderRequest.js";
import { NotFoundError } from "../src/errors.js";

let db: DatabaseSync;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("search_inventory", () => {
  it("matches by name substring, case-insensitively, and sums stock across warehouses", () => {
    const results = searchInventory(db, { query: "widget", category: undefined, limit: 20 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ sku: "TST-0001", total_quantity_on_hand: 105 });
  });

  it("matches by SKU substring", () => {
    const results = searchInventory(db, { query: "0002", category: undefined, limit: 20 });
    expect(results.map((r) => r.sku)).toEqual(["TST-0002"]);
  });

  it("filters by category when provided", () => {
    const results = searchInventory(db, { query: "g", category: "Gadgets", limit: 20 });
    expect(results.map((r) => r.sku).sort()).toEqual(["TST-0002", "TST-0003"]);
  });

  it("respects the limit", () => {
    const results = searchInventory(db, { query: "g", category: undefined, limit: 1 });
    expect(results).toHaveLength(1);
  });
});

describe("get_item_by_sku", () => {
  it("returns full detail including per-warehouse stock", () => {
    const item = getItemBySku(db, { sku: "TST-0001" });
    expect(item.name).toBe("Widget");
    expect(item.supplier_name).toBe("Test Supplier A");
    expect(item.stock).toHaveLength(2);
    expect(item.stock.map((s) => s.warehouse_code).sort()).toEqual(["WH-ONE", "WH-TWO"]);
  });

  it("throws NotFoundError for an unknown SKU", () => {
    expect(() => getItemBySku(db, { sku: "NOPE" })).toThrow(NotFoundError);
  });
});

describe("list_low_stock_items", () => {
  it("returns only lines below their reorder threshold", () => {
    const rows = listLowStockItems(db, {});
    // Widget@WH-TWO (5<20) and Gadget@WH-ONE (3<10) are low; the rest are not.
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sku).sort()).toEqual(["TST-0001", "TST-0002"]);
  });

  it("orders by most-urgent deficit first", () => {
    const rows = listLowStockItems(db, {});
    // Gadget deficit = 10-3 = 7; Widget deficit = 20-5 = 15 -> Widget first.
    expect(rows[0]?.sku).toBe("TST-0001");
  });

  it("filters by warehouse_code", () => {
    const rows = listLowStockItems(db, { warehouse_code: "WH-ONE" });
    expect(rows.map((r) => r.sku)).toEqual(["TST-0002"]);
  });

  it("filters by category", () => {
    const rows = listLowStockItems(db, { category: "Gadgets" });
    expect(rows.map((r) => r.sku)).toEqual(["TST-0002"]);
  });
});

describe("get_warehouse_summary", () => {
  it("summarizes a single warehouse", () => {
    const [summary] = getWarehouseSummary(db, { warehouse_code: "WH-ONE" });
    expect(summary).toMatchObject({
      warehouse_code: "WH-ONE",
      distinct_skus: 2,
      total_units_on_hand: 103,
      low_stock_count: 1,
    });
    // 100 * 1.00 + 3 * 3.00 = 109
    expect(summary?.total_inventory_value).toBeCloseTo(109, 2);
  });

  it("summarizes all warehouses when none is specified", () => {
    const summaries = getWarehouseSummary(db, {});
    expect(summaries).toHaveLength(2);
  });

  it("throws NotFoundError for an unknown warehouse code", () => {
    expect(() => getWarehouseSummary(db, { warehouse_code: "WH-NOPE" })).toThrow(NotFoundError);
  });
});

describe("create_reorder_request", () => {
  it("creates a request and defaults quantity to the stock line's reorder_quantity", () => {
    const result = createReorderRequest(db, { sku: "TST-0002", warehouse_code: "WH-ONE" });
    expect(result.quantity_requested).toBe(40);
    expect(result.status).toBe("pending");

    const row = db
      .prepare("SELECT quantity_requested FROM reorder_requests WHERE id = ?")
      .get(result.id) as { quantity_requested: number };
    expect(row.quantity_requested).toBe(40);
  });

  it("honors an explicit quantity and note", () => {
    const result = createReorderRequest(db, {
      sku: "TST-0001",
      warehouse_code: "WH-TWO",
      quantity: 999,
      note: "urgent restock",
    });
    expect(result.quantity_requested).toBe(999);
    expect(result.note).toBe("urgent restock");
  });

  it("throws NotFoundError when the SKU/warehouse pair has no stock record", () => {
    expect(() => createReorderRequest(db, { sku: "TST-0003", warehouse_code: "WH-ONE" })).toThrow(
      NotFoundError,
    );
  });
});
