#!/usr/bin/env node
// Inventory MCP server entry point.
//
// Why stdio transport: this server is meant to be launched as a child
// process by an MCP client (Claude Desktop, this repo's own src/client.ts,
// or any other MCP host) — not run as a long-lived network service. Stdio
// is the standard transport for that "local tool" pattern: the host owns
// the process lifecycle, and stdin/stdout carry newline-delimited JSON-RPC.
// That also means: NEVER console.log() in this file or anything it calls —
// stdout is the protocol channel. Diagnostics go to console.error (stderr).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { openDb } from "./db.js";
import { NotFoundError } from "./errors.js";
import { ok, toolError } from "./toolResult.js";

import * as searchInventory from "./tools/searchInventory.js";
import * as getItemBySku from "./tools/getItemBySku.js";
import * as listLowStockItems from "./tools/listLowStockItems.js";
import * as getWarehouseSummary from "./tools/getWarehouseSummary.js";
import * as createReorderRequest from "./tools/createReorderRequest.js";
import * as inventorySnapshot from "./resources/inventorySnapshot.js";
import * as reorderBriefing from "./prompts/reorderBriefing.js";

/**
 * Wraps a tool's business-logic function so every tool reports errors the
 * same way: known, anticipated failures (NotFoundError) become a clean
 * isError result; anything else is logged to stderr and returned as a
 * generic message rather than leaking internals to the caller.
 */
function wrapTool<Args>(fn: (db: DatabaseSync, args: Args) => unknown, db: DatabaseSync) {
  return (args: Args) => {
    try {
      return ok(fn(db, args));
    } catch (err) {
      if (err instanceof NotFoundError) {
        return toolError(err.message);
      }
      console.error("[inventory-mcp-toolkit] unexpected tool error:", err);
      return toolError("Internal error handling this tool call. See server logs for details.");
    }
  };
}

export function createServer(db: DatabaseSync): McpServer {
  const server = new McpServer({
    name: "inventory-mcp-toolkit",
    version: "1.0.0",
  });

  server.registerTool(
    searchInventory.name,
    { description: searchInventory.description, inputSchema: searchInventory.inputSchema },
    wrapTool(searchInventory.searchInventory, db),
  );

  server.registerTool(
    getItemBySku.name,
    { description: getItemBySku.description, inputSchema: getItemBySku.inputSchema },
    wrapTool(getItemBySku.getItemBySku, db),
  );

  server.registerTool(
    listLowStockItems.name,
    { description: listLowStockItems.description, inputSchema: listLowStockItems.inputSchema },
    wrapTool(listLowStockItems.listLowStockItems, db),
  );

  server.registerTool(
    getWarehouseSummary.name,
    { description: getWarehouseSummary.description, inputSchema: getWarehouseSummary.inputSchema },
    wrapTool(getWarehouseSummary.getWarehouseSummary, db),
  );

  server.registerTool(
    createReorderRequest.name,
    { description: createReorderRequest.description, inputSchema: createReorderRequest.inputSchema },
    wrapTool(createReorderRequest.createReorderRequest, db),
  );

  server.registerResource(
    inventorySnapshot.resourceName,
    inventorySnapshot.uri,
    inventorySnapshot.metadata,
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(inventorySnapshot.buildSnapshot(db), null, 2),
        },
      ],
    }),
  );

  server.registerPrompt(
    reorderBriefing.name,
    { description: reorderBriefing.description, argsSchema: reorderBriefing.argsSchema },
    (args) => reorderBriefing.buildReorderBriefingPrompt(args),
  );

  return server;
}

async function main(): Promise<void> {
  const db = openDb();
  const server = createServer(db);
  const transport = new StdioServerTransport();

  // Close the database cleanly however the process ends — Ctrl+C from a
  // terminal, or the parent client disconnecting the transport.
  const shutdown = () => {
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
  console.error("[inventory-mcp-toolkit] MCP server connected over stdio");
}

// Guard so this file can be imported by tests (createServer) without
// immediately trying to connect a stdio transport — only run main() when
// this module is the process entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[inventory-mcp-toolkit] fatal error:", err);
    process.exit(1);
  });
}
