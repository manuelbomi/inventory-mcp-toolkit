// Small helpers for shaping MCP tool responses consistently.
//
// Every tool handler in src/tools/*.ts returns plain data; server.ts wraps
// that in one of these before handing it back over the protocol. Keeping
// this in one place means every tool reports errors the same way (as a
// text content block with isError: true) instead of each handler
// reinventing it slightly differently.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
