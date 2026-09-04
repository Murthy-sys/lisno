import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { KnowledgeBaseIndexPage } from "./KnowledgeBaseIndexPage";
import * as knowledgeApi from "./knowledgeApi";
import type {
  KnowledgeBasket,
  KnowledgeBasketDeletionImpact
} from "./knowledgeTypes";

const authState = vi.hoisted(() => ({
  role: "super_admin",
  lifecycle: true
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: {
      id: "super-admin-1",
      name: "Super Admin",
      email: "admin@lisno.example",
      role: authState.role
    },
    authorization: {},
    sessionExpired: false
  })
}));

vi.mock("../../auth/authorization", () => ({
  hasFrontendPermission: (_authorization: unknown, permission: string) =>
    permission === "ai_estimator_knowledge.configuration.lifecycle"
      ? authState.lifecycle
      : true
}));

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    listKnowledgeItems: vi.fn(),
    listKnowledgeBaskets: vi.fn(),
    listKnowledgeMasters: vi.fn(),
    getKnowledgeBasketDeletionImpact: vi.fn(),
    permanentlyDeleteKnowledgeBasket: vi.fn()
  };
});

const timestamp = "2026-08-31T12:00:00.000Z";
const pagination = { limit: 100, offset: 0, total: 0, hasMore: false } as const;
const emptyBasket: KnowledgeBasket = {
  id: "basket-empty",
  name: "Accidental basket",
  description: "Created during setup",
  displayOrder: 8,
  status: "active",
  version: 4,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: timestamp,
  updatedAt: timestamp
};
const archivedBasket: KnowledgeBasket = {
  ...emptyBasket,
  id: "basket-archived",
  name: "Archived basket",
  status: "archived",
  version: 7
};
const laterBasket: KnowledgeBasket = {
  ...emptyBasket,
  id: "basket-later",
  name: "Later empty basket",
  description: "Appears on the second management page",
  displayOrder: 108,
  version: 9
};
const eligibleImpact: KnowledgeBasketDeletionImpact = {
  basketId: emptyBasket.id,
  basketName: emptyBasket.name,
  version: emptyBasket.version,
  mainLineCount: 0,
  historicalReferenceCount: 0,
  bootstrapOwned: false,
  canDelete: true,
  blockers: []
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <KnowledgeBaseIndexPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
  };
}

async function openManagement(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("button", { name: "Manage main baskets" });
  await user.click(trigger);
  return screen.findByRole("dialog", { name: "Manage main baskets" });
}

async function openPermanentDelete(
  user: ReturnType<typeof userEvent.setup>,
  basketName = emptyBasket.name
) {
  const management = await openManagement(user);
  await user.click(
    within(management).getByRole("button", {
      name: `Delete ${basketName} permanently`
    })
  );
  return screen.findByRole("alertdialog", {
    name: "Delete basket?"
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.role = "super_admin";
  authState.lifecycle = true;
  vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({
    items: [],
    pagination: { ...pagination, limit: 20 }
  });
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({
    items: [],
    pagination
  });
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockImplementation(async (params) => {
    const includeArchived = params?.includeArchived === true;
    return {
      items: includeArchived ? [emptyBasket, archivedBasket] : [emptyBasket],
      pagination: {
        ...pagination,
        total: includeArchived ? 2 : 1
      }
    };
  });
  vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact).mockResolvedValue(
    eligibleImpact
  );
  vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeBasket).mockResolvedValue({
    basketId: emptyBasket.id,
    deleted: true,
    deletedAt: timestamp
  });
});

describe("Super Admin permanent Main Basket deletion", () => {
  it("lazily lists empty and archived baskets while retaining distinct lifecycle actions", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(knowledgeApi.listKnowledgeBaskets).toHaveBeenCalledTimes(1);
    const management = await openManagement(user);

    await within(management).findByText(emptyBasket.name);
    expect(within(management).getByText(archivedBasket.name)).toBeVisible();
    expect(knowledgeApi.listKnowledgeBaskets).toHaveBeenCalledWith({
      includeArchived: true,
      limit: 100,
      offset: 0
    });
    expect(within(management).getByRole("button", { name: `Edit ${emptyBasket.name}` })).toBeVisible();
    expect(within(management).getByRole("button", { name: `Delete ${emptyBasket.name}` })).toBeVisible();
    expect(within(management).getByRole("button", { name: `Delete ${emptyBasket.name} permanently` })).toBeVisible();
    expect(within(management).queryByRole("button", { name: `Edit ${archivedBasket.name}` })).not.toBeInTheDocument();
    expect(within(management).queryByRole("button", { name: `Delete ${archivedBasket.name}` })).not.toBeInTheDocument();
    expect(knowledgeApi.getKnowledgeBasketDeletionImpact).not.toHaveBeenCalled();
  });

  it("keeps the management action absent without lifecycle permission or the Super Admin role", async () => {
    authState.lifecycle = false;
    const first = renderPage();
    expect(await screen.findByRole("heading", { name: "AI Estimator Knowledge Base" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Manage main baskets" })).not.toBeInTheDocument();
    first.unmount();

    authState.lifecycle = true;
    authState.role = "admin";
    renderPage();
    expect(await screen.findByRole("heading", { name: "AI Estimator Knowledge Base" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Manage main baskets" })).not.toBeInTheDocument();
  });

  it("loads a later management page and opens permanent deletion for its Basket", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockImplementation(async (params) => {
      if (!params?.includeArchived) {
        return { items: [emptyBasket], pagination: { ...pagination, total: 1 } };
      }
      return params.offset === 100
        ? {
            items: [laterBasket],
            pagination: { limit: 100, offset: 100, total: 101, hasMore: false }
          }
        : {
            items: [emptyBasket],
            pagination: { limit: 100, offset: 0, total: 101, hasMore: true }
          };
    });
    vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact).mockImplementation(async (basketId) => ({
      ...eligibleImpact,
      basketId,
      basketName: basketId === laterBasket.id ? laterBasket.name : emptyBasket.name,
      version: basketId === laterBasket.id ? laterBasket.version : emptyBasket.version
    }));
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeBasket).mockImplementation(async (basketId) => ({
      basketId,
      deleted: true,
      deletedAt: timestamp
    }));
    renderPage();
    const management = await openManagement(user);
    await within(management).findByText(emptyBasket.name);

    await user.click(within(management).getByRole("button", { name: "Next basket page" }));

    expect(await within(management).findByText(laterBasket.name)).toBeVisible();
    await waitFor(() => expect(
      management.querySelector(".knowledge-basket-manager__results")
    ).toHaveFocus());
    expect(within(management).getByText("101–101 of 101")).toBeVisible();
    expect(knowledgeApi.listKnowledgeBaskets).toHaveBeenCalledWith({
      includeArchived: true,
      limit: 100,
      offset: 100
    });
    await user.click(within(management).getByRole("button", {
      name: `Delete ${laterBasket.name} permanently`
    }));
    const deletion = await screen.findByRole("alertdialog", {
      name: "Delete basket?"
    });
    await within(deletion).findByText("This action cannot be undone");
    await user.type(
      within(deletion).getByRole("textbox", { name: "Type basket name to confirm" }),
      laterBasket.name
    );
    await user.type(within(deletion).getByRole("textbox", { name: "Reason" }), "Duplicate setup");
    await user.click(within(deletion).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenCalledWith(
      laterBasket.id,
      {
        expectedVersion: laterBasket.version,
        confirmationName: laterBasket.name,
        reason: "Duplicate setup"
      }
    ));
  });

  it("renders management empty and error states and retries the failed list", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockImplementation(async (params) => ({
      items: params?.includeArchived ? [] : [emptyBasket],
      pagination: { ...pagination, total: params?.includeArchived ? 0 : 1 }
    }));
    const emptyView = renderPage();
    const emptyManagement = await openManagement(user);
    expect(await within(emptyManagement).findByText("No main baskets have been added yet.")).toBeVisible();
    emptyView.unmount();

    vi.mocked(knowledgeApi.listKnowledgeBaskets).mockImplementationOnce(async () => ({
      items: [emptyBasket],
      pagination: { ...pagination, total: 1 }
    })).mockRejectedValueOnce(new Error("Basket list unavailable"))
      .mockResolvedValueOnce({
        items: [emptyBasket],
        pagination: { ...pagination, total: 1 }
      });
    renderPage();
    const errorManagement = await openManagement(user);
    expect(await within(errorManagement).findByText("Basket list unavailable")).toBeVisible();
    await user.click(within(errorManagement).getByRole("button", { name: "Try again" }));
    expect(await within(errorManagement).findByText(emptyBasket.name)).toBeVisible();
  });

  it("shows authoritative blocker counts and prevents deletion", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact).mockResolvedValue({
      ...eligibleImpact,
      mainLineCount: 2,
      historicalReferenceCount: 1,
      canDelete: false,
      blockers: [
        { code: "HAS_MAIN_LINES", message: "This Basket has Main Lines." },
        {
          code: "HAS_HISTORICAL_REFERENCES",
          message: "This Basket is retained in historical configuration."
        }
      ]
    });
    renderPage();

    const dialog = await openPermanentDelete(user);

    expect(await within(dialog).findByText("Permanent deletion is blocked")).toBeVisible();
    expect(within(dialog).getByText("This Basket has Main Lines.")).toBeVisible();
    expect(within(dialog).getByText("This Basket is retained in historical configuration.")).toBeVisible();
    const impact = within(dialog).getByText("Main Lines").closest("dl");
    expect(impact).not.toBeNull();
    expect(within(impact as HTMLElement).getByText("2")).toBeVisible();
    expect(within(impact as HTMLElement).getByText("1")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("requires the exact current name and a reason, then announces success and restores focus", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openPermanentDelete(user);
    const deleteButton = within(dialog).getByRole("button", { name: "Delete" });
    expect(await within(dialog).findByText("This action cannot be undone")).toBeVisible();
    expect(deleteButton).toBeDisabled();

    await user.type(
      within(dialog).getByRole("textbox", { name: "Type basket name to confirm" }),
      emptyBasket.name.toLowerCase()
    );
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Created by mistake");
    expect(deleteButton).toBeDisabled();
    await user.clear(within(dialog).getByRole("textbox", { name: "Type basket name to confirm" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Type basket name to confirm" }),
      emptyBasket.name
    );
    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);

    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenCalledWith(
      emptyBasket.id,
      {
        expectedVersion: eligibleImpact.version,
        confirmationName: emptyBasket.name,
        reason: "Created by mistake"
      }
    ));
    expect(await screen.findByRole("status")).toHaveTextContent(
      `Main basket “${emptyBasket.name}” was permanently deleted.`
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Manage main baskets" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Manage main baskets" })).toHaveFocus();
    });
  });

  it("refreshes a version conflict, clears confirmation, and never auto-retries deletion", async () => {
    const user = userEvent.setup();
    const refreshedImpact = { ...eligibleImpact, version: 5 };
    vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact)
      .mockResolvedValueOnce(eligibleImpact)
      .mockResolvedValueOnce(refreshedImpact);
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeBasket)
      .mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere."))
      .mockResolvedValueOnce({ basketId: emptyBasket.id, deleted: true, deletedAt: timestamp });
    renderPage();
    const dialog = await openPermanentDelete(user);
    await within(dialog).findByText("This action cannot be undone");
    const confirmation = within(dialog).getByRole("textbox", { name: "Type basket name to confirm" });
    const reason = within(dialog).getByRole("textbox", { name: "Reason" });
    await user.type(confirmation, emptyBasket.name);
    await user.type(reason, "Duplicate setup");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByText("Basket changed")).toBeVisible();
    expect(confirmation).toHaveValue("");
    expect(knowledgeApi.getKnowledgeBasketDeletionImpact).toHaveBeenCalledTimes(2);
    expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled();

    await user.type(confirmation, emptyBasket.name);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenCalledTimes(2));
    expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenLastCalledWith(
      emptyBasket.id,
      expect.objectContaining({ expectedVersion: 5 })
    );
  });

  it("reports a failed conflict refresh without claiming current impact was loaded", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact)
      .mockResolvedValueOnce(eligibleImpact)
      .mockRejectedValueOnce(new Error("Impact refresh unavailable"))
      .mockResolvedValueOnce({ ...eligibleImpact, version: 5 });
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeBasket).mockRejectedValueOnce(
      new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.")
    );
    renderPage();
    const dialog = await openPermanentDelete(user);
    await within(dialog).findByText("This action cannot be undone");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Type basket name to confirm" }),
      emptyBasket.name
    );
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Duplicate setup");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByText("Impact refresh failed")).toBeVisible();
    expect(within(dialog).getByText("Impact refresh unavailable")).toBeVisible();
    expect(within(dialog).queryByText(/latest deletion impact was loaded/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Basket changed")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: "Retry impact check" }));
    expect(await within(dialog).findByText("Basket changed")).toBeVisible();
    expect(within(dialog).queryByText("Impact refresh failed")).not.toBeInTheDocument();
    expect(knowledgeApi.permanentlyDeleteKnowledgeBasket).toHaveBeenCalledTimes(1);
  });

  it("offers retry when the deletion impact cannot be loaded", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.getKnowledgeBasketDeletionImpact)
      .mockRejectedValueOnce(new Error("Impact unavailable"))
      .mockResolvedValueOnce(eligibleImpact);
    renderPage();

    const dialog = await openPermanentDelete(user);
    expect(await within(dialog).findByText("Impact unavailable")).toBeVisible();
    expect(within(dialog).queryByRole("textbox", { name: "Reason" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Retry impact check" }));
    expect(await within(dialog).findByRole("textbox", { name: "Reason" })).toBeVisible();
  });

  it.each([1440, 1024, 768, 390, 320])(
    "keeps management controls rendered and accessible at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));
      const user = userEvent.setup();
      renderPage();
      const management = await openManagement(user);
      await within(management).findByText(emptyBasket.name);
      expect(management.querySelector(".knowledge-basket-manager__row")).toBeVisible();
      expect(within(management).getByRole("button", { name: `Delete ${emptyBasket.name} permanently` })).toBeVisible();
      const results = await axe.run(document.body, {
        rules: {
          "color-contrast": { enabled: false },
          region: { enabled: false }
        }
      });
      expect(results.violations).toEqual([]);
    }
  );
});
