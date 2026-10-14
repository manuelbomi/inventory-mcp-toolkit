# inventory-mcp-toolkit

A small, realistic warehouse/inventory system exposed through the **Model
Context Protocol (MCP)** — a server, a standalone client, and a test suite,
all in TypeScript. 

## What is MCP, and why does it matter?

Large language models are good at reasoning over text but can't, by
themselves, look anything up or do anything in the real world. **MCP is an
open protocol (from Anthropic) that standardizes how an LLM-powered
application ("host") talks to external tools and data sources ("servers")**
— things like "search this database," "read this file," "create this
ticket."

Before MCP, every AI app that wanted to integrate with, say, a database or
a SaaS API wrote its own bespoke integration. MCP gives that integration a
common shape: a server exposes **tools** (functions a model can call),
**resources** (data it can read), and **prompts** (reusable instruction
templates) over a standard JSON-RPC interface. Any MCP-compatible host
(Claude Desktop, an IDE assistant, your own agent) can then talk to any MCP
server without custom glue code. Write the integration once, use it
everywhere.

This repo *is* that integration, for a warehouse inventory system:

- **Server** (`src/server.ts`) — exposes 5 tools, 1 resource, and 1 prompt
  over inventory data stored in SQLite.
- **Client** (`src/client.ts`) — a minimal MCP host that spawns the server,
  lists its capabilities, and calls each one, so you can see the protocol
  work without installing Claude Desktop.

## Architecture

```
                         spawns as a child process, talks over
                         stdin/stdout using JSON-RPC 2.0
┌────────────────────┐   ───────────────────────────────▶   ┌──────────────────────┐
│   MCP Client/Host   │                                      │     MCP Server        │
│                      │   ◀───────────────────────────────  │  (src/server.ts)      │
│ - src/client.ts      │        tool results, resource         │                       │
│   (this repo's demo) │        contents, prompt messages      │  5 tools              │
│ - or: Claude Desktop │                                      │  1 resource            │
│ - or: any MCP host   │                                      │  1 prompt              │
└────────────────────┘                                      └───────────┬───────────┘
                                                                           │
                                                                           │ better-sqlite-style
                                                                           │ synchronous queries
                                                                           ▼
                                                              ┌──────────────────────┐
                                                              │  SQLite (node:sqlite) │
                                                              │  data/inventory.db     │
                                                              │                        │
                                                              │  suppliers             │
                                                              │  warehouses            │
                                                              │  items                 │
                                                              │  stock_levels          │
                                                              │  reorder_requests      │
                                                              └──────────────────────┘
```

Each tool handler (`src/tools/*.ts`) is a small, pure function —
`(db, args) => data` — with no MCP-specific code in it. `src/server.ts`
is the only place that imports the MCP SDK's server classes; it wraps each
handler so errors come back as proper MCP tool results. That split is what
makes the handlers unit-testable without spinning up any protocol
machinery at all (see `tests/tools.test.ts`), while `tests/e2e.test.ts`
exercises the real protocol stack in-process.

## The data model

Five tables, seeded by `npm run seed` (`src/data/seed.ts`):

| Table               | What it holds                                            |
| ------------------- | --------------------------------------------------------- |
| `suppliers`         | Who you buy a SKU from, and their typical lead time       |
| `warehouses`        | Physical locations stock lives in                         |
| `items`             | SKUs: name, category, cost, price, supplier               |
| `stock_levels`      | Quantity on hand per (item, warehouse), plus reorder rules |
| `reorder_requests`  | An append-only log of reorder requests created by the `create_reorder_request` tool |

The seed data: 5 suppliers, 4 warehouses, 20 SKUs across 5 categories
(Fasteners, Electronics, Packaging, Hand Tools, Safety), and 40
item/warehouse stock rows — deliberately a mix of healthy and low-stock
lines so `list_low_stock_items` has something real to show you.

## Setup

Requires **Node.js 22.5 or newer** (for the built-in `node:sqlite` module —
see [Design decisions](#design-decisions) below). No native build tools,
no Docker, no external database required.

```bash
git clone <this repo>
cd inventory-mcp-toolkit
npm install
npm run seed        # creates data/inventory.db and fills it with demo data
```

### Run the server + client together

The easiest way to see everything work is the included client, which spawns
the server itself:

```bash
npm run dev:client
```

This prints the list of available tools, reads the live inventory
resource, calls every tool with example arguments, and prints the
responses — including a deliberate "SKU not found" call so you can see
error handling in action.

### Run the server by itself

```bash
npm run dev:server
```

It will sit there connected over stdio, waiting for a client (this is
normal — it's not a web server, there's nothing to curl). Press Ctrl+C to
stop it.

### Build and run the compiled version

```bash
npm run build
npm run start:server   # node dist/server.js
npm run start:client   # node dist/client.js
```

### Run the tests

```bash
npm test
```

## The tools

All five tools validate their input with [Zod](https://zod.dev) schemas.
If you pass bad arguments, the MCP SDK rejects the call *before* the
handler ever runs — you get a structured validation error back, not a
stack trace.

### `search_inventory`

Search by item name or SKU substring, with an optional category filter.

**Input:**
```json
{ "query": "cable", "limit": 5 }
```
**Output:**
```json
[
  {
    "sku": "EL-2001",
    "name": "USB-C Cable 1m",
    "category": "Electronics",
    "unit_price": 6.99,
    "total_quantity_on_hand": 258
  }
]
```

### `get_item_by_sku`

Full detail for one exact SKU: pricing, supplier, and stock at every
warehouse that carries it.

**Input:** `{ "sku": "EL-2001" }`
**Output:**
```json
{
  "sku": "EL-2001",
  "name": "USB-C Cable 1m",
  "unit_cost": 1.5,
  "unit_price": 6.99,
  "supplier_name": "Cascade Electronics Supply",
  "stock": [
    { "warehouse_code": "WH-EAST", "quantity_on_hand": 240, "reorder_threshold": 100, "reorder_quantity": 500 },
    { "warehouse_code": "WH-WEST", "quantity_on_hand": 18,  "reorder_threshold": 100, "reorder_quantity": 500 }
  ]
}
```
Call it with a SKU that doesn't exist and you get back a clean error
result (`isError: true`, message `No item found with SKU "..."`) instead
of an exception.

### `list_low_stock_items`

Every (item, warehouse) line currently below its reorder threshold,
ranked by how urgent the deficit is. Optional `warehouse_code` and
`category` filters.

**Input:** `{ "warehouse_code": "WH-WEST" }`
**Output:** an array of entries like:
```json
{
  "sku": "EL-2003",
  "item_name": "Micro Relay 12V",
  "warehouse_code": "WH-WEST",
  "quantity_on_hand": 12,
  "reorder_threshold": 40,
  "supplier_name": "Cascade Electronics Supply",
  "lead_time_days": 10
}
```

### `get_warehouse_summary`

Roll-up stats for one warehouse, or all of them if `warehouse_code` is
omitted: distinct SKU count, total units on hand, total inventory value
at cost, and how many lines are low on stock.

**Input:** `{}`
**Output:**
```json
[
  { "warehouse_code": "WH-EAST", "distinct_skus": 11, "total_units_on_hand": 14970, "total_inventory_value": 5779, "low_stock_count": 0 },
  { "warehouse_code": "WH-WEST", "distinct_skus": 9,  "total_units_on_hand": 708,   "total_inventory_value": 1072.5, "low_stock_count": 8 }
]
```

### `create_reorder_request`

The one *write* tool. Inserts a row into `reorder_requests`. If `quantity`
is omitted, it defaults to that stock line's configured
`reorder_quantity`, so a caller doesn't need to already know that number.

**Input:**
```json
{ "sku": "SF-5003", "warehouse_code": "WH-WEST", "note": "running low before the holiday rush" }
```
**Output:**
```json
{
  "id": 1,
  "sku": "SF-5003",
  "warehouse_code": "WH-WEST",
  "quantity_requested": 150,
  "status": "pending",
  "requested_at": "2026-10-01 13:28:46",
  "note": "running low before the holiday rush"
}
```

## The resource: `inventory://snapshot`

A live, point-in-time JSON view of every item's stock across every
warehouse, with a `low_stock_count`. Resources exist for data a client
wants to read directly — grounding context — without the overhead or
semantics of a tool call. It's computed fresh from the database on every
read, never cached, since a stale inventory snapshot would be actively
misleading.

## The prompt: `reorder_briefing`

A reusable instruction template (optionally scoped to one warehouse) that
tells a model: check `list_low_stock_items`, check `get_warehouse_summary`
for context, rank by urgency (factoring in supplier lead time), and
propose — but don't yet execute — reorder requests. This is the MCP
pattern for encoding a *workflow*, as opposed to a single tool call.

## Connecting it to Claude Desktop

1. Build the project (`npm run build`) so `dist/server.js` exists, and run
   `npm run seed` at least once.
2. Open Claude Desktop's config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Add this server under `mcpServers` (adjust the path to where you cloned
   this repo):

```json
{
  "mcpServers": {
    "inventory-mcp-toolkit": {
      "command": "node",
      "args": ["C:\\path\\to\\inventory-mcp-toolkit\\dist\\server.js"]
    }
  }
}
```

4. Restart Claude Desktop. You should see the hammer/tools icon show the
   five inventory tools, and you can ask things like "what's low on stock
   in WH-WEST?" or "give me a reorder briefing for the Dallas warehouse."

## Design decisions

A few choices worth explaining rather than leaving implicit:

- **`node:sqlite` instead of `better-sqlite3`.** Node 22.5+ ships a
  synchronous SQLite driver in core. Using it means `npm install` never
  needs a native build toolchain (Python, a C++ compiler) on the
  contributor's machine — a common source of "it doesn't work on my
  machine" for SQLite-based Node projects. The tradeoff is a smaller,
  newer API surface, but everything this project needs (prepared
  statements, basic pragmas) is there.
- **stdio transport, not HTTP.** MCP supports both. stdio is the right
  choice for a *local* tool a host spawns and owns the lifecycle of — the
  classic Claude Desktop pattern. HTTP/SSE transports exist in the SDK for
  when a server needs to run remotely and serve multiple clients; this
  project doesn't need that.
- **Zod schemas on every tool input.** The MCP SDK uses them to both
  generate the JSON Schema clients see *and* validate incoming arguments
  before your handler runs. That means a handler can trust its arguments
  are well-formed and focus on business logic — no manual `if (typeof x
  !== "string")` checks scattered through the codebase.
- **Pure handler functions, separate from the MCP wiring.** Every tool's
  actual logic is a plain function of `(db, args) -> data`, exported
  separately from its Zod shape. `server.ts` is the only file that touches
  the MCP SDK's server classes. This is what makes `tests/tools.test.ts`
  possible without any protocol overhead.
- **Errors as data, not exceptions, at the tool boundary.** A handler
  throws a typed `NotFoundError` for an anticipated failure (unknown SKU,
  unknown warehouse); `server.ts` catches it and returns a clean
  `isError: true` result. Anything unexpected is logged to stderr (never
  stdout — that's the protocol channel) and reported generically, so
  internal details never leak into a tool result.

## How I'd extend this

- **Pagination** on `search_inventory` and `list_low_stock_items` — fine
  for 20 SKUs, not for 20,000.
- **A `supplier` resource template** (`inventory://supplier/{id}`) so a
  client can look up supplier detail without a dedicated tool.
- **An `update_stock_level` tool** to simulate receiving a shipment or
  recording a sale, with the obvious transactional care around not letting
  stock go negative.
- **Idempotency keys** on `create_reorder_request` so a retried call from
  a flaky client doesn't double-create a request.
- **A real event log** — right now `reorder_requests.status` only ever
  becomes `"pending"`; a `mark_reorder_fulfilled` tool and a status history
  table would make this closer to a real purchasing workflow.
- **Streamable HTTP transport** as a second entry point, if this ever
  needed to be shared across multiple remote clients instead of spawned
  locally per host.

## Project layout

```
src/
  data/
    schema.ts          CREATE TABLE statements
    seed.ts             demo data loader (npm run seed)
  tools/                one file per MCP tool, pure (db, args) -> data
  resources/            inventory snapshot resource
  prompts/              reorder_briefing prompt template
  db.ts                 SQLite connection helper
  errors.ts             NotFoundError / ConflictError
  toolResult.ts         ok()/toolError() MCP result helpers
  server.ts             McpServer wiring + stdio entry point
  client.ts             standalone demo client
tests/
  testDb.ts             small, stable in-memory fixture
  tools.test.ts         unit tests against the pure handler functions
  e2e.test.ts           real client <-> server over an in-memory transport
```

## License

MIT — see [LICENSE](./LICENSE).
