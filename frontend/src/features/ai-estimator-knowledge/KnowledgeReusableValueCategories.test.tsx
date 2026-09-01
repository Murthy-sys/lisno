import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeReusableValuesPage } from "./KnowledgeReusableValuesPage";
import * as knowledgeApi from "./knowledgeApi";
import type { KnowledgeMaster } from "./knowledgeTypes";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { id: "super-admin-1", name: "Super Admin", email: "admin@lisno.example", role: "super_admin" },
    authorization: {},
    sessionExpired: false
  })
}));

vi.mock("../../auth/authorization", () => ({
  hasFrontendPermission: vi.fn(() => true)
}));

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return { ...actual, listKnowledgeMasters: vi.fn() };
});

const timestamp = "2026-09-01T08:00:00.000Z";
const uom: KnowledgeMaster = {
  id: "uom-square-foot",
  masterType: "uoms",
  code: "SQFT",
  name: "Square foot",
  description: null,
  displayOrder: 1,
  status: "active",
  decimalScale: 2,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: timestamp,
  updatedAt: timestamp
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><KnowledgeReusableValuesPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => {
    const items = type === "uoms" ? [uom] : [];
    return {
      items,
      pagination: { limit: 25, offset: 0, total: items.length, hasMore: false }
    };
  });
});

describe("reusable estimation value categories", () => {
  it("offers exactly the five reusable categories and no Mode management", async () => {
    renderPage();

    expect(await screen.findByRole("table")).toBeVisible();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "UOMs",
      "Vendors",
      "Taxes",
      "Priorities",
      "Surfaces"
    ]);
    const mobileSelector = screen.getByRole("combobox", { name: "Reusable value category" });
    expect(within(mobileSelector).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "UOMs",
      "Vendors",
      "Taxes",
      "Priorities",
      "Surfaces"
    ]);
    expect(screen.queryByRole("tab", { name: "Modes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add Mode/u })).not.toBeInTheDocument();
    expect(screen.queryByText(/reusable Mode/iu)).not.toBeInTheDocument();
  });

  it("preserves Code for UOM and keyboard navigation ends on Surfaces", async () => {
    const user = userEvent.setup();
    renderPage();

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Code and name" })).toBeVisible();
    expect(within(table).getByText("SQFT")).toBeVisible();

    const uoms = screen.getByRole("tab", { name: "UOMs" });
    uoms.focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Surfaces" })).toHaveFocus();
  });
});
