import { describe, expect, it } from "vitest";
import { projectBudgetDetailHref, projectBudgetListHref } from "./projectBudgetNavigation";

describe("Finance budget navigation", () => {
  it("preserves list filters and page through an encoded stable project ID", () => {
    const detail = projectBudgetDetailHref("project/two", "?clientId=client-2&search=North+House&offset=10&budgetStatus=at_risk");
    expect(detail.startsWith("/finance/projects/project%2Ftwo?")).toBe(true);
    const returnTo = new URL(detail, "https://lisno.invalid").searchParams.get("returnTo");
    const filters = new URL(projectBudgetListHref(returnTo), "https://lisno.invalid").searchParams;
    expect(Object.fromEntries(filters)).toEqual({ search: "North House", clientId: "client-2", budgetStatus: "at_risk", offset: "10" });
  });

  it.each([undefined, "https://example.com/finance", "//example.com/finance", "/finance/projects/one", "javascript:alert(1)", "/finance#details"])("rejects unsafe or unrelated return locations: %s", (candidate) => {
    expect(projectBudgetListHref(candidate)).toBe("/finance");
  });

  it("drops unrelated parameters and fragments", () => {
    expect(projectBudgetListHref("/finance?search=Villa&redirect=https://example.com#anything")).toBe("/finance?search=Villa");
  });
});
