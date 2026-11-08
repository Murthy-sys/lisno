import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authorization from "../../auth/authorization";
import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import * as api from "./knowledgeApi";
import * as catalogueApi from "../leads/estimationCatalogueApi";
import type { EstimationCatalogue } from "../leads/estimationCatalogueApi";
import type { KnowledgeItemDetail, KnowledgeRevision, KnowledgeSectionEnvelope } from "./knowledgeTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  status: "authenticated", authorization: {}, user: { id: "preview-admin", role: "super_admin" }
}) }));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: vi.fn(() => true) }));
vi.mock("../leads/estimationCatalogueApi", async importOriginal => ({
  ...await importOriginal<typeof import("../leads/estimationCatalogueApi")>(), getEstimationCatalogue: vi.fn()
}));
vi.mock("./knowledgeApi", async importOriginal => ({
  ...await importOriginal<typeof import("./knowledgeApi")>(),
  getKnowledgeItem: vi.fn(), getKnowledgeHistory: vi.fn(), getKnowledgeSection: vi.fn(),
  listKnowledgeItems: vi.fn(), listKnowledgeBaskets: vi.fn(), listKnowledgeMasters: vi.fn(),
  listKnowledgeSubBaskets: vi.fn(), getKnowledgeBasketQuality: vi.fn(),
  listKnowledgeQualityControlOptions: vi.fn(), updateKnowledgeSection: vi.fn(),
  updateKnowledgeBasketQuality: vi.fn(), updateKnowledgeMainLine: vi.fn(), previewKnowledge: vi.fn()
}));

const metadata = { createdById: "preview-admin", updatedById: "preview-admin",
  createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z" };
const completeness = { percentage: 50, sections: [], blockers: [], warnings: [] };
const revision: KnowledgeRevision = {
  ...metadata, id: "draft-a", mainLineId: "line-a", revisionNumber: 2, status: "draft",
  sourceRevisionId: "active-a", contentDigest: null, completeness, activatedAt: null,
  activatedById: null, supersededAt: null, supersededById: null, version: 4
};
const item: KnowledgeItemDetail = {
  ...metadata, id: "line-a", mainLineId: "line-a", mainLineName: "POP false ceiling", itemType: "main_line",
  completionRequired: false, basketId: "basket-a", basketName: "POP / Gypsum",
  subBasketId: "sub-a", subBasketName: "Ceiling", description: null, status: "draft",
  activeRevisionId: "active-a", draftRevisionId: "draft-a", revisionNumber: 2,
  uomId: null, priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [], completeness,
  allowedActions: ["update_section"], activeRevision: { ...revision, id: "active-a", status: "active" },
  draftRevision: revision, blockers: [], warnings: [], version: 9
};
const pagination = { limit: 100, offset: 0, total: 0, hasMore: false };

function catalogue(name = "Saved ceiling"): EstimationCatalogue {
  return { ineligibleLineCount: 0, readyNonActiveSupported: true, items: [{
    id: "basket-a", name: "POP / Gypsum", displayOrder: 0, subBaskets: [{
      id: "sub-a", basketId: "basket-a", name: "Ceiling", displayOrder: 0, mainLines: [{
        id: "line-a", mainLineId: "line-a", basketId: "basket-a", subBasketId: "sub-a", name,
        displayOrder: 0, revisionId: "draft-a", revisionStatus: "draft", itemStatus: "draft",
        itemVersion: 9, revisionVersion: 4, clientVisible: true, applicableTiers: ["signature"],
        uom: { id: "sqft", name: "sq-ft", code: "SQFT", decimalScale: 2 },
        tierPricing: { signature: { modeBaseRatesPaise: { sub_vendor: 10125, pmc: 12000, in_house: null } } },
        modeBaseRatesPaise: { sub_vendor: 10125, pmc: 12000, in_house: null }
      }]
    }]
  }] };
}

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/configuration/line-a"]}>
    <Routes><Route path="/configuration/:itemId" element={<main><KnowledgeItemWorkspacePage /></main>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorization.hasFrontendPermission).mockReturnValue(true);
  vi.mocked(api.getKnowledgeItem).mockResolvedValue(item);
  vi.mocked(api.getKnowledgeHistory).mockResolvedValue({ items: [revision], pagination });
  vi.mocked(api.getKnowledgeSection).mockImplementation(async (mainLineId, revisionId, sectionKey): Promise<KnowledgeSectionEnvelope> => ({
    ...metadata, id: `${revisionId}-${sectionKey}`, mainLineId, revisionId, sectionKey,
    applicability: "configured", version: 4, payload: sectionKey === "overview" ? { applicableTiers: ["signature", "premium"] } : {}
  }));
  for (const read of [api.listKnowledgeItems, api.listKnowledgeBaskets, api.listKnowledgeMasters, api.listKnowledgeSubBaskets]) {
    vi.mocked(read).mockResolvedValue({ items: [], pagination });
  }
  vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ basketId: "basket-a", basketName: "POP / Gypsum", basketStatus: "active",
    version: 1, revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null });
  vi.mocked(api.listKnowledgeQualityControlOptions).mockResolvedValue({ items: [] });
  vi.mocked(catalogueApi.getEstimationCatalogue).mockResolvedValue(catalogue());
});

describe("Main Line Client view entry point", () => {
  it("opens without saving or discarding edited Overview, then restores focus and refreshes saved data on reopen", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const trigger = await screen.findByRole("button", { name: "Client view" });
    expect(catalogueApi.getEstimationCatalogue).not.toHaveBeenCalled();
    const premium = await screen.findByRole("checkbox", { name: "Premium" });
    expect(premium).toBeChecked();
    await user.click(premium);
    expect(premium).not.toBeChecked();
    await user.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "Client view" });
    expect(await within(drawer).findByText("Saved ceiling")).toBeVisible();
    expect(drawer).toHaveTextContent("Preview uses saved configuration. Save your changes to update it.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: /^(save|submit)\b/i })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(premium).not.toBeChecked();
    await waitFor(() => expect(trigger).toHaveFocus());

    vi.mocked(catalogueApi.getEstimationCatalogue).mockResolvedValue(catalogue("New saved ceiling"));
    await user.click(trigger);
    expect(await within(screen.getByRole("dialog", { name: "Client view" })).findByText("New saved ceiling")).toBeVisible();
    expect(catalogueApi.getEstimationCatalogue).toHaveBeenCalledTimes(2);
    for (const mutation of [api.updateKnowledgeSection, api.updateKnowledgeBasketQuality, api.updateKnowledgeMainLine, api.previewKnowledge]) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });

  it.each(["ai_estimator_knowledge.configuration.read", "estimation.catalogue.read"])("requires the existing %s capability", async permission => {
    vi.mocked(authorization.hasFrontendPermission).mockImplementation((_auth, candidate) => candidate !== permission);
    renderWorkspace();
    await screen.findByRole("heading", { level: 1, name: "POP false ceiling" });
    expect(screen.queryByRole("button", { name: "Client view" })).not.toBeInTheDocument();
    expect(catalogueApi.getEstimationCatalogue).not.toHaveBeenCalled();
  });
});
