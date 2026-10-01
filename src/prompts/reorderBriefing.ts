// Prompt: reorder_briefing
//
// MCP prompts are reusable message templates a client can surface to a user
// (e.g. as a slash command) or hand straight to a model. This one doesn't
// touch the database itself — it just assembles instructions that point the
// model at the right *tools* (list_low_stock_items, get_warehouse_summary,
// create_reorder_request) and the order to call them in. That separation is
// deliberate: prompts shape *how* a model approaches a task, tools do the
// actual work.
import { z } from "zod";

export const name = "reorder_briefing";

export const description =
  "Produce a briefing prompt asking the assistant to review low-stock items " +
  "(optionally scoped to one warehouse) and draft prioritized reorder " +
  "recommendations, using the inventory tools to gather data first.";

export const argsSchema = {
  warehouse_code: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional warehouse code to scope the briefing to, e.g. 'WH-WEST'."),
};

export interface ReorderBriefingArgs {
  warehouse_code?: string | undefined;
}

export function buildReorderBriefingPrompt(args: ReorderBriefingArgs): {
  description: string;
  messages: Array<{ role: "user"; content: { type: "text"; text: string } }>;
} {
  const scope = args.warehouse_code ? `warehouse ${args.warehouse_code}` : "all warehouses";

  const text = [
    `You are reviewing inventory for ${scope}.`,
    "",
    "1. Call list_low_stock_items" +
      (args.warehouse_code ? ` with warehouse_code="${args.warehouse_code}"` : "") +
      " to find every item currently below its reorder threshold.",
    "2. Call get_warehouse_summary" +
      (args.warehouse_code ? ` with warehouse_code="${args.warehouse_code}"` : "") +
      " for context on overall inventory value and low-stock counts.",
    "3. Rank the low-stock items by how urgent they are (how far below threshold, " +
      "and the supplier's lead_time_days — a long lead time makes a smaller " +
      "deficit more urgent).",
    "4. For the top few, propose calling create_reorder_request with a sensible " +
      "quantity and a short note explaining why, but DO NOT call it yet — present " +
      "the plan first and wait for confirmation.",
    "",
    "Present the result as a short prioritized list, not a raw data dump.",
  ].join("\n");

  return {
    description: `Reorder briefing for ${scope}`,
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}
