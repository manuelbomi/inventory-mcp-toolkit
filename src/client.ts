#!/usr/bin/env node
// A standalone MCP client for this toolkit.
//
// This exists so you can see the full protocol round-trip — spawn the
// server, list its tools, call each one — without needing Claude Desktop
// or any other host installed. It's the same StdioClientTransport /
// Client pair a real host uses internally; nothing here is a simulation.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds the command used to spawn the server. When this file is running
 * as compiled JS (dist/client.js) we spawn the compiled server directly
 * with plain `node`. When it's running under tsx in dev (src/client.ts) we
 * spawn the TypeScript server through tsx's loader instead, so `npm run
 * dev:client` works without a build step first.
 */
function buildServerCommand(): { command: string; args: string[] } {
  const isCompiled = __dirname.includes(`${path.sep}dist`);
  if (isCompiled) {
    return { command: process.execPath, args: [path.join(__dirname, "server.js")] };
  }
  return {
    command: process.execPath,
    args: ["--import", "tsx", path.join(__dirname, "server.ts")],
  };
}

function printSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  const { command, args } = buildServerCommand();

  const transport = new StdioClientTransport({
    command,
    args,
    // Forward the server's own diagnostic logging (stderr) to this
    // process's stderr so failures in the child are visible here too.
    stderr: "inherit",
  });

  const client = new Client({ name: "inventory-mcp-toolkit-client", version: "1.0.0" });

  await client.connect(transport);
  console.log("connected to inventory-mcp-toolkit server over stdio");

  printSection("listTools");
  const { tools } = await client.listTools();
  for (const tool of tools) {
    console.log(`- ${tool.name}: ${tool.description}`);
  }

  printSection("resources/read inventory://snapshot");
  const snapshot = await client.readResource({ uri: "inventory://snapshot" });
  const firstContent = snapshot.contents[0];
  const snapshotText = firstContent && "text" in firstContent ? firstContent.text : undefined;
  if (typeof snapshotText === "string") {
    const parsed = JSON.parse(snapshotText) as { item_count: number; low_stock_count: number };
    console.log(`snapshot: ${parsed.item_count} items tracked, ${parsed.low_stock_count} low-stock lines`);
  }

  printSection("call: search_inventory");
  const searchResult = await client.callTool({
    name: "search_inventory",
    arguments: { query: "cable", limit: 5 },
  });
  console.log(getText(searchResult));

  printSection("call: get_item_by_sku");
  const itemResult = await client.callTool({
    name: "get_item_by_sku",
    arguments: { sku: "EL-2001" },
  });
  console.log(getText(itemResult));

  printSection("call: get_item_by_sku (unknown SKU, expect a clean error)");
  const missingResult = await client.callTool({
    name: "get_item_by_sku",
    arguments: { sku: "DOES-NOT-EXIST" },
  });
  console.log(`isError=${missingResult.isError ?? false}:`, getText(missingResult));

  printSection("call: list_low_stock_items");
  const lowStockResult = await client.callTool({
    name: "list_low_stock_items",
    arguments: { warehouse_code: "WH-WEST" },
  });
  console.log(getText(lowStockResult));

  printSection("call: get_warehouse_summary");
  const summaryResult = await client.callTool({
    name: "get_warehouse_summary",
    arguments: {},
  });
  console.log(getText(summaryResult));

  printSection("call: create_reorder_request");
  const reorderResult = await client.callTool({
    name: "create_reorder_request",
    arguments: { sku: "SF-5003", warehouse_code: "WH-WEST", note: "demo run from client.ts" },
  });
  console.log(getText(reorderResult));

  printSection("prompts/get: reorder_briefing");
  const prompt = await client.getPrompt({ name: "reorder_briefing", arguments: { warehouse_code: "WH-WEST" } });
  console.log(prompt.messages[0]?.content);

  await client.close();
  console.log("\ndone — connection closed");
}

function getText(result: unknown): string {
  const content =
    typeof result === "object" && result !== null ? (result as { content?: unknown }).content : undefined;
  if (!Array.isArray(content)) return "(no text content)";
  const block = content.find(
    (c): c is { type: "text"; text: string } =>
      typeof c === "object" && c !== null && (c as { type?: unknown }).type === "text",
  );
  return block?.text ?? "(no text content)";
}

main().catch((err) => {
  console.error("client failed:", err);
  process.exit(1);
});
