// End-to-end test: drives the *real* MCP protocol stack — a real
// McpServer and a real Client, Zod validation, JSON-RPC message framing —
// just over an in-memory transport instead of spawning a child process
// over stdio. That keeps the test fast and reliable on every OS/CI runner
// while still exercising the exact same server.ts wiring the stdio
// transport uses (see src/client.ts for the stdio version of this flow,
// which you can run by hand with `npm run dev:client`).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { createTestDb } from "./testDb.js";

let db: DatabaseSync;
let client: Client;

beforeEach(async () => {
  db = createTestDb();
  const server = createServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  db.close();
});

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((c) => c.type === "text")?.text ?? "";
}

describe("mcp server (end to end)", () => {
  it("advertises all five tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_reorder_request",
      "get_item_by_sku",
      "get_warehouse_summary",
      "list_low_stock_items",
      "search_inventory",
    ]);
  });

  it("round-trips a search_inventory call through real JSON-RPC + Zod validation", async () => {
    const result = await client.callTool({ name: "search_inventory", arguments: { query: "Widget", limit: 5 } });
    const parsed = JSON.parse(textOf(result)) as Array<{ sku: string }>;
    expect(parsed).toEqual([{ sku: "TST-0001", name: "Widget", category: "Widgets", unit_price: 2.5, total_quantity_on_hand: 105 }]);
  });

  it("rejects a tool call that fails Zod validation before it ever reaches the handler", async () => {
    // The SDK validates arguments against inputSchema itself, before our
    // handler ever runs, and reports the failure the same way our own
    // NotFoundError is reported: isError: true, not a thrown protocol error.
    const result = await client.callTool({ name: "search_inventory", arguments: { query: "" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("query");
  });

  it("surfaces a NotFoundError as isError: true rather than throwing a protocol error", async () => {
    const result = await client.callTool({ name: "get_item_by_sku", arguments: { sku: "NOPE" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("NOPE");
  });

  it("creates a reorder request end to end and it is visible in the database", async () => {
    const result = await client.callTool({
      name: "create_reorder_request",
      arguments: { sku: "TST-0002", warehouse_code: "WH-ONE", note: "e2e test" },
    });
    const parsed = JSON.parse(textOf(result)) as { id: number; quantity_requested: number };
    expect(parsed.quantity_requested).toBe(40);

    const row = db.prepare("SELECT note FROM reorder_requests WHERE id = ?").get(parsed.id) as { note: string };
    expect(row.note).toBe("e2e test");
  });

  it("reads the live inventory snapshot resource", async () => {
    const result = await client.readResource({ uri: "inventory://snapshot" });
    const first = result.contents[0];
    const text = first && "text" in first ? first.text : undefined;
    const snapshot = JSON.parse(text ?? "{}") as { item_count: number; low_stock_count: number };
    expect(snapshot.item_count).toBe(3);
    expect(snapshot.low_stock_count).toBe(2);
  });

  it("gets the reorder_briefing prompt with the warehouse filled in", async () => {
    const result = await client.getPrompt({ name: "reorder_briefing", arguments: { warehouse_code: "WH-ONE" } });
    const message = result.messages[0];
    const text = message && "text" in message.content ? message.content.text : undefined;
    expect(text).toContain("WH-ONE");
  });
});
