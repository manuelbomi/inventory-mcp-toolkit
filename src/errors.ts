// Small error hierarchy so tool handlers can throw something meaningful
// instead of a bare Error. server.ts inspects `instanceof NotFoundError`
// to decide whether to surface a clean, user-facing message (isError: true
// tool result) versus letting something truly unexpected propagate as a
// 500-ish "internal error" — the MCP equivalent of not leaking a stack
// trace to the model for a case you anticipated.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
