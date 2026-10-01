// Shared domain types. These mirror the SQLite schema in src/data/schema.ts
// and give the tool handlers (src/tools/*) a typed view of each row instead
// of passing `any` around after a raw query.

export interface Supplier {
  id: number;
  name: string;
  contact_email: string;
  lead_time_days: number;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  city: string;
  state: string;
}

export interface Item {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  supplier_id: number;
}

export interface StockLevel {
  id: number;
  item_id: number;
  warehouse_id: number;
  quantity_on_hand: number;
  reorder_threshold: number;
  reorder_quantity: number;
}

export interface ReorderRequest {
  id: number;
  item_id: number;
  warehouse_id: number;
  quantity_requested: number;
  status: string;
  requested_at: string;
  note: string | null;
}

// Convenience "joined" shapes used by tool responses, where returning raw
// foreign keys would make the JSON useless to a model or a human reading it.
export interface ItemWithStock extends Item {
  supplier_name: string;
  stock: Array<{
    warehouse_code: string;
    warehouse_name: string;
    quantity_on_hand: number;
    reorder_threshold: number;
    reorder_quantity: number;
  }>;
}

export interface LowStockEntry {
  sku: string;
  item_name: string;
  category: string;
  warehouse_code: string;
  warehouse_name: string;
  quantity_on_hand: number;
  reorder_threshold: number;
  reorder_quantity: number;
  supplier_name: string;
  supplier_email: string;
  lead_time_days: number;
}

export interface WarehouseSummary {
  warehouse_code: string;
  warehouse_name: string;
  city: string;
  state: string;
  distinct_skus: number;
  total_units_on_hand: number;
  total_inventory_value: number;
  low_stock_count: number;
}
