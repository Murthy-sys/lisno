import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../../auth/AuthProvider";
import { authorizationFor } from "../../test/authFixtures";
import { listKnowledgeMasters } from "../ai-estimator-knowledge/knowledgeApi";
import { ProcurementDashboardPage } from "./ProcurementDashboardPage";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../ai-estimator-knowledge/knowledgeApi", () => ({ listKnowledgeMasters: vi.fn() }));

function setup(permissions = authorizationFor("super_admin").permissions) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "super-admin-1", name: "Super Admin", email: "admin@lisno.example", role: "super_admin" },
    authorization: authorizationFor("super_admin", permissions)
  } as ReturnType<typeof useAuth>);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><ProcurementDashboardPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("Super Admin procurement dashboard", () => {
  it("shows the three real vendor overview counts and links to the shared directory", async () => {
    vi.mocked(listKnowledgeMasters).mockResolvedValue({
      items: [],
      pagination: { total: 0, limit: 1, offset: 0, hasMore: false },
      directoryOverview: { totalVendors: 21, activeVendors: 13, underReviewVendors: 5 }
    });
    setup();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Loading procurement metrics");
    const overview = await screen.findByRole("region", { name: "Vendor overview" });
    expect(within(overview).getByText("Total vendors").parentElement).toHaveTextContent("Total vendors21");
    expect(within(overview).getByText("Active vendors").parentElement).toHaveTextContent("Active vendors13");
    expect(within(overview).getByText("Under review").parentElement).toHaveTextContent("Under review5");
    expect(within(overview).getByRole("link", { name: "Open Vendors" })).toHaveAttribute("href", "/admin/procurement/vendors");
    expect(listKnowledgeMasters).toHaveBeenCalledWith("vendors", { includeDirectoryOverview: true, limit: 1, offset: 0 });
  });

  it("reports an unavailable overview without manufacturing zero counts", async () => {
    vi.mocked(listKnowledgeMasters).mockRejectedValue(new Error("offline"));
    setup();
    expect(await screen.findByText("Procurement metrics could not be loaded.")).toBeVisible();
    expect(screen.queryByText("Total vendors")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry metrics" })).toBeVisible();
  });

  it("does not request private directory data without vendor-directory permission", () => {
    setup(["identity.self.read", "procurement.vendor_suggestions.read"]);
    expect(screen.getByText("You do not have permission to view procurement metrics.")).toBeVisible();
    expect(listKnowledgeMasters).not.toHaveBeenCalled();
  });
});
