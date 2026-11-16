import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../api/client";
import { getProjectBudgetPage, getProjectFinanceBuckets } from "./projectFinanceApi";

afterEach(() => vi.restoreAllMocks());

describe("finance list budget basis", () => {
  it("requests the commitment basis for project budget filtering", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    await getProjectBudgetPage({ budgetStatus: "over_budget", projectId: "project/one", offset: 10 });
    const query = new URL(String(get.mock.calls[0][0]), "http://localhost").searchParams;
    expect(Object.fromEntries(query)).toEqual({ limit: "10", offset: "10", budgetBasis: "including_commitments", budgetStatus: "over_budget", projectId: "project/one" });
  });

  it("preserves the default recorded basis for the standard finance list", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({});
    await getProjectFinanceBuckets(100);
    expect(get).toHaveBeenCalledWith("/finance/projects?limit=100&offset=100");
  });
});
