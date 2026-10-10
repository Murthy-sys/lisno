import { describe, expect, it } from "vitest";
import { executionPortfolioQuerySchema, executionQuerySchema } from "../src/domain/vendor-execution.js";

describe("execution portfolio query boundary", () => {
  it("preserves all-project defaults and accepts an explicit current-project scope", () => {
    expect(executionPortfolioQuerySchema.parse({})).toEqual({ limit: 50, offset: 0, projectScope: "all" });
    expect(executionPortfolioQuerySchema.parse({ projectScope: "current", limit: "12", offset: "12", q: " Oak " }))
      .toEqual({ projectScope: "current", limit: 12, offset: 12, q: "Oak" });
  });

  it("rejects the portfolio-only scope on work, history and notification queries", () => {
    expect(executionQuerySchema.safeParse({ projectScope: "current" }).success).toBe(false);
    expect(executionPortfolioQuerySchema.safeParse({ projectScope: "completed" }).success).toBe(false);
    expect(executionPortfolioQuerySchema.safeParse({ projectScope: "current", unrelated: true }).success).toBe(false);
  });
});
