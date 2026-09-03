import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasFrontendPermission } from "../../auth/authorization";
import { KnowledgeReusableValuesPage } from "./KnowledgeReusableValuesPage";
import * as knowledgeApi from "./knowledgeApi";
import type { KnowledgeMaster, KnowledgeSurface } from "./knowledgeTypes";

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
  return {
    ...actual,
    listKnowledgeMasters: vi.fn(),
    updateKnowledgeSurface: vi.fn()
  };
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
const wallSurface: KnowledgeSurface = {
  id: "surface-wall",
  masterType: "surfaces",
  code: "SURFACE_WALL_INTERNAL",
  name: "Wall surface",
  description: "Paint, wallpaper, texture",
  displayOrder: 10,
  status: "active",
  version: 4,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: timestamp,
  updatedAt: timestamp
};
const legacySurface: KnowledgeSurface = {
  ...wallSurface,
  id: "surface-legacy",
  code: "SURFACE_LEGACY_INTERNAL",
  name: "Legacy surface",
  description: null,
  status: "inactive"
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
  vi.mocked(hasFrontendPermission).mockReturnValue(true);
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockImplementation(async (type) => {
    const items = type === "uoms"
      ? [uom]
      : type === "surfaces"
        ? [wallSurface, legacySurface]
        : [];
    return {
      items,
      pagination: { limit: 25, offset: 0, total: items.length, hasMore: false }
    };
  });
  vi.mocked(knowledgeApi.updateKnowledgeSurface).mockImplementation(async (id, input) => ({
    ...(id === wallSurface.id ? wallSurface : legacySurface),
    status: input.status ?? (id === wallSurface.id ? wallSurface.status : legacySurface.status),
    version: (id === wallSurface.id ? wallSurface.version : legacySurface.version) + 1
  }));
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

  it("presents specialized Surface management without technical fields", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: "Surfaces" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Surfaces" })).toBeVisible();
    expect(screen.getByText("Create reusable surface options for Main Lines and the estimator.")).toBeVisible();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Surface",
      "Examples / components",
      "Status",
      "Actions"
    ]);
    const wallRow = within(table).getByRole("row", { name: /Wall surface/iu });
    expect(within(wallRow).getByText("Paint, wallpaper, texture")).toBeVisible();
    const legacyRow = within(table).getByRole("row", { name: /Legacy surface/iu });
    expect(within(legacyRow).getByText("Not configured")).toBeVisible();
    expect(within(table).queryByText(/SURFACE_.*_INTERNAL/iu)).not.toBeInTheDocument();

    await user.click(within(wallRow).getByRole("button", { name: "Deactivate Wall surface" }));
    expect(knowledgeApi.updateKnowledgeSurface).toHaveBeenCalledWith(wallSurface.id, {
      expectedVersion: wallSurface.version,
      status: "inactive"
    });

    await user.click(screen.getByRole("button", { name: "Add Surface" }));
    const dialog = screen.getByRole("dialog", { name: "Add Surface" });
    expect(within(dialog).getByRole("textbox", { name: "Surface name" })).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Examples / components" })).toBeVisible();
    expect(within(dialog).queryByText(/Code|Stable ID|Display order|Version/iu)).not.toBeInTheDocument();
  });

  it("keeps Surface management actions permission-gated", async () => {
    const user = userEvent.setup();
    vi.mocked(hasFrontendPermission).mockReturnValue(false);
    renderPage();

    await user.click(screen.getByRole("tab", { name: "Surfaces" }));
    const table = await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Edit/iu })).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Archive/iu })).not.toBeInTheDocument();
  });
});
