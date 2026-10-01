// Seeds the SQLite database with a small, realistic warehouse/inventory
// dataset: suppliers, warehouses, items (SKUs), and per-warehouse stock
// levels. Re-runnable: it wipes existing rows first, so `npm run seed` is
// safe to run as many times as you like while you experiment.
//
// Run with: npm run seed
import { openDb } from "../db.js";

interface SupplierSeed {
  name: string;
  contact_email: string;
  lead_time_days: number;
}

interface WarehouseSeed {
  code: string;
  name: string;
  city: string;
  state: string;
}

interface ItemSeed {
  sku: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  supplier: string; // supplier name, resolved to an id below
}

interface StockSeed {
  sku: string;
  warehouse: string; // warehouse code, resolved to an id below
  quantity_on_hand: number;
  reorder_threshold: number;
  reorder_quantity: number;
}

const suppliers: SupplierSeed[] = [
  { name: "Northbridge Components", contact_email: "orders@northbridge-components.example", lead_time_days: 5 },
  { name: "Pacific Rim Hardware", contact_email: "sales@pacificrimhardware.example", lead_time_days: 12 },
  { name: "Summit Fasteners Co.", contact_email: "contact@summitfasteners.example", lead_time_days: 7 },
  { name: "Cascade Electronics Supply", contact_email: "support@cascadeelec.example", lead_time_days: 10 },
  { name: "Union Packaging Group", contact_email: "orders@unionpackaging.example", lead_time_days: 4 },
];

const warehouses: WarehouseSeed[] = [
  { code: "WH-EAST", name: "Newark Distribution Center", city: "Newark", state: "NJ" },
  { code: "WH-CENTRAL", name: "Columbus Fulfillment Hub", city: "Columbus", state: "OH" },
  { code: "WH-WEST", name: "Reno Logistics Park", city: "Reno", state: "NV" },
  { code: "WH-SOUTH", name: "Dallas Regional Warehouse", city: "Dallas", state: "TX" },
];

const items: ItemSeed[] = [
  { sku: "FN-1001", name: "Hex Bolt M8x40", category: "Fasteners", unit_cost: 0.12, unit_price: 0.35, supplier: "Summit Fasteners Co." },
  { sku: "FN-1002", name: "Wing Nut M6", category: "Fasteners", unit_cost: 0.08, unit_price: 0.25, supplier: "Summit Fasteners Co." },
  { sku: "FN-1003", name: "Flat Washer 10mm", category: "Fasteners", unit_cost: 0.03, unit_price: 0.10, supplier: "Summit Fasteners Co." },
  { sku: "FN-1004", name: "Lock Washer 8mm", category: "Fasteners", unit_cost: 0.04, unit_price: 0.12, supplier: "Summit Fasteners Co." },
  { sku: "EL-2001", name: "USB-C Cable 1m", category: "Electronics", unit_cost: 1.50, unit_price: 6.99, supplier: "Cascade Electronics Supply" },
  { sku: "EL-2002", name: "9V Battery Pack (4-pack)", category: "Electronics", unit_cost: 0.90, unit_price: 3.49, supplier: "Cascade Electronics Supply" },
  { sku: "EL-2003", name: "Micro Relay 12V", category: "Electronics", unit_cost: 2.20, unit_price: 7.50, supplier: "Cascade Electronics Supply" },
  { sku: "EL-2004", name: "LED Indicator Light", category: "Electronics", unit_cost: 0.35, unit_price: 1.99, supplier: "Cascade Electronics Supply" },
  { sku: "PK-3001", name: "Corrugated Box 12x12x12", category: "Packaging", unit_cost: 0.75, unit_price: 1.95, supplier: "Union Packaging Group" },
  { sku: "PK-3002", name: "Bubble Wrap Roll 100ft", category: "Packaging", unit_cost: 4.00, unit_price: 11.99, supplier: "Union Packaging Group" },
  { sku: "PK-3003", name: "Packing Tape 2in", category: "Packaging", unit_cost: 1.10, unit_price: 3.49, supplier: "Union Packaging Group" },
  { sku: "PK-3004", name: "Pallet Stretch Film", category: "Packaging", unit_cost: 6.50, unit_price: 15.99, supplier: "Union Packaging Group" },
  { sku: "HT-4001", name: "Claw Hammer 16oz", category: "Hand Tools", unit_cost: 5.50, unit_price: 14.99, supplier: "Northbridge Components" },
  { sku: "HT-4002", name: "Adjustable Wrench 10in", category: "Hand Tools", unit_cost: 6.80, unit_price: 17.99, supplier: "Northbridge Components" },
  { sku: "HT-4003", name: "Phillips Screwdriver Set", category: "Hand Tools", unit_cost: 4.20, unit_price: 11.49, supplier: "Northbridge Components" },
  { sku: "HT-4004", name: "Needle Nose Pliers", category: "Hand Tools", unit_cost: 3.90, unit_price: 9.99, supplier: "Northbridge Components" },
  { sku: "SF-5001", name: "Safety Goggles", category: "Safety", unit_cost: 1.80, unit_price: 5.99, supplier: "Pacific Rim Hardware" },
  { sku: "SF-5002", name: "Nitrile Gloves (box of 100)", category: "Safety", unit_cost: 3.20, unit_price: 8.99, supplier: "Pacific Rim Hardware" },
  { sku: "SF-5003", name: "Hard Hat", category: "Safety", unit_cost: 4.50, unit_price: 12.99, supplier: "Pacific Rim Hardware" },
  { sku: "SF-5004", name: "Hi-Vis Safety Vest", category: "Safety", unit_cost: 3.75, unit_price: 9.99, supplier: "Pacific Rim Hardware" },
];

// Two warehouses per SKU, with a deliberate mix of healthy and low-stock
// rows so list_low_stock_items has real (and varied) results to return.
const stock: StockSeed[] = [
  { sku: "FN-1001", warehouse: "WH-EAST", quantity_on_hand: 4200, reorder_threshold: 500, reorder_quantity: 2000 },
  { sku: "FN-1001", warehouse: "WH-CENTRAL", quantity_on_hand: 310, reorder_threshold: 500, reorder_quantity: 2000 },
  { sku: "FN-1002", warehouse: "WH-EAST", quantity_on_hand: 1800, reorder_threshold: 300, reorder_quantity: 1500 },
  { sku: "FN-1002", warehouse: "WH-WEST", quantity_on_hand: 95, reorder_threshold: 300, reorder_quantity: 1500 },
  { sku: "FN-1003", warehouse: "WH-EAST", quantity_on_hand: 6000, reorder_threshold: 1000, reorder_quantity: 3000 },
  { sku: "FN-1003", warehouse: "WH-SOUTH", quantity_on_hand: 2200, reorder_threshold: 1000, reorder_quantity: 3000 },
  { sku: "FN-1004", warehouse: "WH-CENTRAL", quantity_on_hand: 150, reorder_threshold: 400, reorder_quantity: 1500 },
  { sku: "FN-1004", warehouse: "WH-SOUTH", quantity_on_hand: 1750, reorder_threshold: 400, reorder_quantity: 1500 },

  { sku: "EL-2001", warehouse: "WH-EAST", quantity_on_hand: 240, reorder_threshold: 100, reorder_quantity: 500 },
  { sku: "EL-2001", warehouse: "WH-WEST", quantity_on_hand: 18, reorder_threshold: 100, reorder_quantity: 500 },
  { sku: "EL-2002", warehouse: "WH-CENTRAL", quantity_on_hand: 60, reorder_threshold: 75, reorder_quantity: 300 },
  { sku: "EL-2002", warehouse: "WH-SOUTH", quantity_on_hand: 410, reorder_threshold: 75, reorder_quantity: 300 },
  { sku: "EL-2003", warehouse: "WH-EAST", quantity_on_hand: 85, reorder_threshold: 40, reorder_quantity: 200 },
  { sku: "EL-2003", warehouse: "WH-WEST", quantity_on_hand: 12, reorder_threshold: 40, reorder_quantity: 200 },
  { sku: "EL-2004", warehouse: "WH-CENTRAL", quantity_on_hand: 500, reorder_threshold: 150, reorder_quantity: 600 },
  { sku: "EL-2004", warehouse: "WH-SOUTH", quantity_on_hand: 130, reorder_threshold: 150, reorder_quantity: 600 },

  { sku: "PK-3001", warehouse: "WH-EAST", quantity_on_hand: 1200, reorder_threshold: 300, reorder_quantity: 1000 },
  { sku: "PK-3001", warehouse: "WH-WEST", quantity_on_hand: 260, reorder_threshold: 300, reorder_quantity: 1000 },
  { sku: "PK-3002", warehouse: "WH-CENTRAL", quantity_on_hand: 90, reorder_threshold: 50, reorder_quantity: 200 },
  { sku: "PK-3002", warehouse: "WH-SOUTH", quantity_on_hand: 35, reorder_threshold: 50, reorder_quantity: 200 },
  { sku: "PK-3003", warehouse: "WH-EAST", quantity_on_hand: 700, reorder_threshold: 200, reorder_quantity: 800 },
  { sku: "PK-3003", warehouse: "WH-WEST", quantity_on_hand: 150, reorder_threshold: 200, reorder_quantity: 800 },
  { sku: "PK-3004", warehouse: "WH-CENTRAL", quantity_on_hand: 410, reorder_threshold: 100, reorder_quantity: 400 },
  { sku: "PK-3004", warehouse: "WH-SOUTH", quantity_on_hand: 60, reorder_threshold: 100, reorder_quantity: 400 },

  { sku: "HT-4001", warehouse: "WH-EAST", quantity_on_hand: 220, reorder_threshold: 50, reorder_quantity: 150 },
  { sku: "HT-4001", warehouse: "WH-WEST", quantity_on_hand: 14, reorder_threshold: 50, reorder_quantity: 150 },
  { sku: "HT-4002", warehouse: "WH-CENTRAL", quantity_on_hand: 180, reorder_threshold: 40, reorder_quantity: 120 },
  { sku: "HT-4002", warehouse: "WH-SOUTH", quantity_on_hand: 31, reorder_threshold: 40, reorder_quantity: 120 },
  { sku: "HT-4003", warehouse: "WH-EAST", quantity_on_hand: 95, reorder_threshold: 30, reorder_quantity: 100 },
  { sku: "HT-4003", warehouse: "WH-WEST", quantity_on_hand: 110, reorder_threshold: 30, reorder_quantity: 100 },
  { sku: "HT-4004", warehouse: "WH-CENTRAL", quantity_on_hand: 25, reorder_threshold: 35, reorder_quantity: 100 },
  { sku: "HT-4004", warehouse: "WH-SOUTH", quantity_on_hand: 140, reorder_threshold: 35, reorder_quantity: 100 },

  { sku: "SF-5001", warehouse: "WH-EAST", quantity_on_hand: 300, reorder_threshold: 80, reorder_quantity: 250 },
  { sku: "SF-5001", warehouse: "WH-WEST", quantity_on_hand: 40, reorder_threshold: 80, reorder_quantity: 250 },
  { sku: "SF-5002", warehouse: "WH-CENTRAL", quantity_on_hand: 220, reorder_threshold: 60, reorder_quantity: 200 },
  { sku: "SF-5002", warehouse: "WH-SOUTH", quantity_on_hand: 55, reorder_threshold: 60, reorder_quantity: 200 },
  { sku: "SF-5003", warehouse: "WH-EAST", quantity_on_hand: 130, reorder_threshold: 40, reorder_quantity: 150 },
  { sku: "SF-5003", warehouse: "WH-WEST", quantity_on_hand: 9, reorder_threshold: 40, reorder_quantity: 150 },
  { sku: "SF-5004", warehouse: "WH-CENTRAL", quantity_on_hand: 180, reorder_threshold: 50, reorder_quantity: 150 },
  { sku: "SF-5004", warehouse: "WH-SOUTH", quantity_on_hand: 48, reorder_threshold: 50, reorder_quantity: 150 },
];

function seed(): void {
  const db = openDb();

  // Wipe in FK-safe order so re-running the script is idempotent.
  db.exec(`
    DELETE FROM reorder_requests;
    DELETE FROM stock_levels;
    DELETE FROM items;
    DELETE FROM warehouses;
    DELETE FROM suppliers;
    DELETE FROM sqlite_sequence;
  `);

  const insertSupplier = db.prepare(
    "INSERT INTO suppliers (name, contact_email, lead_time_days) VALUES (?, ?, ?)",
  );
  const supplierIds = new Map<string, number>();
  for (const s of suppliers) {
    const result = insertSupplier.run(s.name, s.contact_email, s.lead_time_days);
    supplierIds.set(s.name, Number(result.lastInsertRowid));
  }

  const insertWarehouse = db.prepare(
    "INSERT INTO warehouses (code, name, city, state) VALUES (?, ?, ?, ?)",
  );
  const warehouseIds = new Map<string, number>();
  for (const w of warehouses) {
    const result = insertWarehouse.run(w.code, w.name, w.city, w.state);
    warehouseIds.set(w.code, Number(result.lastInsertRowid));
  }

  const insertItem = db.prepare(
    "INSERT INTO items (sku, name, category, unit_cost, unit_price, supplier_id) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const itemIds = new Map<string, number>();
  for (const item of items) {
    const supplierId = supplierIds.get(item.supplier);
    if (supplierId === undefined) {
      throw new Error(`seed data error: unknown supplier "${item.supplier}" for SKU ${item.sku}`);
    }
    const result = insertItem.run(item.sku, item.name, item.category, item.unit_cost, item.unit_price, supplierId);
    itemIds.set(item.sku, Number(result.lastInsertRowid));
  }

  const insertStock = db.prepare(
    `INSERT INTO stock_levels (item_id, warehouse_id, quantity_on_hand, reorder_threshold, reorder_quantity)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const row of stock) {
    const itemId = itemIds.get(row.sku);
    const warehouseId = warehouseIds.get(row.warehouse);
    if (itemId === undefined || warehouseId === undefined) {
      throw new Error(`seed data error: bad stock row for ${row.sku} @ ${row.warehouse}`);
    }
    insertStock.run(itemId, warehouseId, row.quantity_on_hand, row.reorder_threshold, row.reorder_quantity);
  }

  db.close();

  console.log(
    `seeded ${suppliers.length} suppliers, ${warehouses.length} warehouses, ${items.length} items, ${stock.length} stock rows`,
  );
}

seed();
