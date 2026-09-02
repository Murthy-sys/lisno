import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import { KnowledgeMasterEditorDialog } from "./KnowledgeMasterEditorDialog";
import * as knowledgeApi from "./knowledgeApi";
import type {
  KnowledgeBasket,
  KnowledgeItemListItem,
  KnowledgeMaster,
  KnowledgeMasterType
} from "./knowledgeTypes";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "super-admin-1",
      name: "Super Admin",
      email: "admin@lisno.example",
      role: "super_admin"
    },
    authorization: {},
    sessionExpired: false
  })
}));

vi.mock("../../auth/authorization", () => ({
  hasFrontendPermission: () => true
}));

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    listKnowledgeItems: vi.fn(),
    listKnowledgeBaskets: vi.fn(),
    listKnowledgeMasters: vi.fn(),
    createKnowledgeBasket: vi.fn(),
    updateKnowledgeBasket: vi.fn(),
    createKnowledgeMaster: vi.fn(),
    updateKnowledgeMaster: vi.fn()
  };
});

const timestamp = "2026-08-29T08:00:00.000Z";
const pagination = { limit: 100, offset: 0, total: 0, hasMore: false } as const;

const basket: KnowledgeBasket = {
  id: "basket-1",
  name: "Carpentry",
  description: "Carpentry knowledge",
  displayOrder: 12,
  status: "active",
  version: 4,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: timestamp,
  updatedAt: timestamp
};

const item: KnowledgeItemListItem = {
  id: "line-1",
  basketId: basket.id,
  basketName: basket.name,
  mainLineId: "line-1",
  mainLineName: "Wall panelling",
  description: "Wall panelling knowledge",
  status: "draft",
  activeRevisionId: null,
  draftRevisionId: "revision-1",
  revisionNumber: 1,
  uomId: null,
  priorityId: null,
  modeIds: [],
  surfaceIds: [],
  vendorIds: [],
  completeness: { percentage: 0, sections: [], blockers: [], warnings: [] },
  allowedActions: [],
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: timestamp,
  updatedAt: timestamp
};

function master(
  masterType: KnowledgeMasterType = "uoms",
  overrides: Partial<KnowledgeMaster> = {}
): KnowledgeMaster {
  return {
    id: `${masterType}-1`,
    masterType,
    code: masterType === "uoms" ? "SQFT" : "STANDARD",
    name: masterType === "uoms" ? "Square foot" : "Standard",
    description: null,
    displayOrder: 12,
    status: "active",
    ...(masterType === "uoms" ? { decimalScale: 2 } : {}),
    version: 4,
    createdById: "super-admin-1",
    updatedById: "super-admin-1",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function renderWithQuery(element: React.ReactElement, router = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {router ? <MemoryRouter>{element}</MemoryRouter> : element}
    </QueryClientProvider>
  );
}

async function expectNoAutomatedAccessibilityViolations() {
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false } }
  });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({
    items: [],
    pagination
  });
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({
    items: [],
    pagination
  });
  vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
    items: [],
    pagination: { ...pagination, limit: 20 }
  });
  vi.mocked(knowledgeApi.createKnowledgeBasket).mockResolvedValue(basket);
  vi.mocked(knowledgeApi.updateKnowledgeBasket).mockResolvedValue(basket);
  vi.mocked(knowledgeApi.createKnowledgeMaster).mockImplementation(
    async (type, input) => master(type, input)
  );
  vi.mocked(knowledgeApi.updateKnowledgeMaster).mockImplementation(
    async (type, _id, input) => master(type, input)
  );
});

describe("automatic knowledge-base display order forms", () => {
  it("creates a main basket without exposing or sending display order", async () => {
    const user = userEvent.setup();
    renderWithQuery(<KnowledgeBaseIndexPage />, true);

    await user.click(await screen.findByRole("button", { name: "Add main basket" }));
    const dialog = screen.getByRole("dialog", { name: "Add main basket" });
    expect(within(dialog).queryByRole("spinbutton", { name: "Display order" })).not.toBeInTheDocument();

    await user.type(within(dialog).getByRole("textbox", { name: "Basket name" }), "Plumbing");
    await user.type(within(dialog).getByRole("textbox", { name: "Description" }), "Plumbing work");
    await user.click(within(dialog).getByRole("button", { name: "Add main basket" }));

    await waitFor(() => expect(knowledgeApi.createKnowledgeBasket).toHaveBeenCalledWith({
      name: "Plumbing",
      description: "Plumbing work"
    }));
    expect(knowledgeApi.createKnowledgeBasket).toHaveBeenCalledWith(
      expect.not.objectContaining({ displayOrder: expect.anything() })
    );
  });

  it("keeps display order required and explicit when editing a main basket", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({
      items: [basket],
      pagination: { ...pagination, total: 1 }
    });
    vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
      items: [item],
      pagination: { ...pagination, limit: 20, total: 1 }
    });
    renderWithQuery(<KnowledgeBaseIndexPage />, true);

    await user.click(await screen.findByRole("button", { name: "Edit basket" }));
    const dialog = screen.getByRole("dialog", { name: "Edit main basket" });
    const order = within(dialog).getByRole("spinbutton", { name: "Display order" });
    expect(order).toHaveValue(12);

    await user.clear(order);
    expect(within(dialog).getByRole("button", { name: "Save basket" })).toBeDisabled();
    await user.type(order, "9007199254740992");
    expect(within(dialog).getByRole("button", { name: "Save basket" })).toBeDisabled();
    await user.clear(order);
    await user.type(order, "14");
    await user.click(within(dialog).getByRole("button", { name: "Save basket" }));

    await waitFor(() => expect(knowledgeApi.updateKnowledgeBasket).toHaveBeenCalledWith(
      basket.id,
      {
        expectedVersion: basket.version,
        name: basket.name,
        description: basket.description,
        displayOrder: 14,
        status: "active"
      }
    ));
  });

  it.each<KnowledgeMasterType>([
    "uoms",
    "vendors",
    "taxes",
    "priorities",
    "surfaces"
  ])("does not expose display order when quick-adding %s", async (masterType) => {
    const view = renderWithQuery(
      <KnowledgeMasterEditorDialog
        masterType={masterType}
        quickAdd
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("spinbutton", { name: "Display order" })).not.toBeInTheDocument();
    await expectNoAutomatedAccessibilityViolations();
    view.unmount();
  });

  it("does not expose display order in the standard reusable-value create dialog", () => {
    renderWithQuery(
      <KnowledgeMasterEditorDialog
        masterType="vendors"
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Add Vendor" });
    expect(within(dialog).queryByRole("spinbutton", { name: "Display order" })).not.toBeInTheDocument();
  });

  it("creates a reusable UOM without display order and preserves quick-add selection", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithQuery(
      <KnowledgeMasterEditorDialog
        masterType="uoms"
        quickAdd
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick add UOM" });
    expect(within(dialog).getByRole("textbox", { name: "Code" })).toBeRequired();
    await user.type(within(dialog).getByRole("textbox", { name: "Code" }), "SQM");
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Square metre");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Quantity decimal places" }),
      "2"
    );
    await user.click(within(dialog).getByRole("button", { name: "Add UOM" }));

    await waitFor(() => expect(knowledgeApi.createKnowledgeMaster).toHaveBeenCalledWith(
      "uoms",
      {
        code: "SQM",
        name: "Square metre",
        description: null,
        decimalScale: 2
      }
    ));
    expect(knowledgeApi.createKnowledgeMaster).toHaveBeenCalledWith(
      "uoms",
      expect.not.objectContaining({ displayOrder: expect.anything() })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      code: "SQM",
      name: "Square metre"
    })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates a quick-added Tax with an active rate without exposing version status", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <KnowledgeMasterEditorDialog
        masterType="taxes"
        quickAdd
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick add Tax" });
    expect(within(dialog).queryByRole("combobox", { name: "Version status" })).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Code" }), "GST18");
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "GST 18%");
    await user.type(within(dialog).getByRole("spinbutton", { name: "Rate (basis points)" }), "1800");
    await user.type(within(dialog).getByRole("textbox", { name: "Applicability" }), "standard work");
    const effectiveFrom = within(dialog).getByLabelText(/^Effective from/u);
    await user.type(effectiveFrom, "2026-09-02T09:30");
    await user.click(within(dialog).getByRole("button", { name: "Add Tax" }));

    await waitFor(() => expect(knowledgeApi.createKnowledgeMaster).toHaveBeenCalledWith(
      "taxes",
      expect.objectContaining({
        taxVersion: expect.objectContaining({
          rateBps: 1800,
          treatment: "exclusive",
          applicability: "standard work",
          effectiveFrom: new Date("2026-09-02T09:30").toISOString(),
          effectiveTo: null,
          status: "active"
        })
      })
    ));
  });

  it("keeps display order required and explicit when editing a reusable value", async () => {
    const user = userEvent.setup();
    const existing = master("uoms");
    renderWithQuery(
      <KnowledgeMasterEditorDialog
        masterType="uoms"
        existing={existing}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Edit UOM" });
    const order = within(dialog).getByRole("spinbutton", { name: "Display order" });
    expect(order).toHaveValue(12);

    await user.clear(order);
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.type(order, "-1");
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.clear(order);
    await user.type(order, "9007199254740992");
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.clear(order);
    await user.type(order, "18");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(knowledgeApi.updateKnowledgeMaster).toHaveBeenCalledWith(
      "uoms",
      existing.id,
      {
        code: existing.code,
        name: existing.name,
        description: existing.description,
        decimalScale: existing.decimalScale,
        displayOrder: 18,
        expectedVersion: existing.version,
        status: "active"
      }
    ));
  });
});
