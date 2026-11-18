import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authorization from "../../auth/authorization";
import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import * as api from "./knowledgeApi";
import * as catalogueApi from "../leads/estimationCatalogueApi";
import type { EstimationCatalogue, EstimationCatalogueMainLine } from "../leads/estimationCatalogueApi";
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
  listKnowledgeSubBaskets: vi.fn(), getKnowledgeBasketQuality: vi.fn(), getKnowledgeSubBasketMargins: vi.fn(),
  listKnowledgeQualityControlOptions: vi.fn(), updateKnowledgeSection: vi.fn(), initializeKnowledgeTierDescriptions: vi.fn(),
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

function catalogue(name = "Saved ceiling", lineOverrides: Partial<EstimationCatalogueMainLine> = {}): EstimationCatalogue {
  return { ineligibleLineCount: 0, readyNonActiveSupported: true, items: [{
    id: "basket-a", name: "POP / Gypsum", displayOrder: 0, subBaskets: [{
      id: "sub-a", basketId: "basket-a", name: "Ceiling", displayOrder: 0, mainLines: [{
        id: "line-a", mainLineId: "line-a", basketId: "basket-a", subBasketId: "sub-a", name,
        displayOrder: 0, revisionId: "draft-a", revisionStatus: "draft", itemStatus: "draft",
        itemVersion: 9, revisionVersion: 4, clientVisible: true, applicableTiers: ["signature"],
        uom: { id: "sqft", name: "sq-ft", code: "SQFT", decimalScale: 2 },
        tierPricing: { signature: { modeBaseRatesPaise: { sub_vendor: 10125, pmc: 12000, in_house: null } } },
        modeBaseRatesPaise: { sub_vendor: 10125, pmc: 12000, in_house: null }, ...lineOverrides
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
  vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementation(async (mainLineId, revisionId, input) => ({
    mainLineId, revisionId, version: input.expectedVersion, aggregateVersion: input.expectedAggregateVersion,
    sourceTier: null, copiedTiers: []
  }));
  vi.mocked(api.getKnowledgeHistory).mockResolvedValue({ items: [revision], pagination });
  vi.mocked(api.getKnowledgeSection).mockImplementation(async (mainLineId, revisionId, sectionKey, options): Promise<KnowledgeSectionEnvelope> => ({
    ...metadata, id: `${revisionId}-${sectionKey}`, mainLineId, revisionId, sectionKey,
    applicability: "configured", version: 4, payload: sectionKey === "overview" ? { applicableTiers: ["signature", "premium"] } : {},
    ...(options?.modeTier ? { modeTier: options.modeTier } : {})
  }));
  for (const read of [api.listKnowledgeItems, api.listKnowledgeBaskets, api.listKnowledgeMasters, api.listKnowledgeSubBaskets]) {
    vi.mocked(read).mockResolvedValue({ items: [], pagination });
  }
  vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ basketId: "basket-a", basketName: "POP / Gypsum", basketStatus: "active",
    version: 1, revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null });
  vi.mocked(api.listKnowledgeQualityControlOptions).mockResolvedValue({ items: [] });
  const unavailable = { ranges: [], mismatchCount: null, mismatches: [], canApply: false, unavailableReason: "Not configured" };
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ basketId: "basket-a", subBasketId: "sub-a", source: null,
    totalMainLines: 1, versionToken: "preview", modes: { pmc: unavailable, sub_vendor: unavailable, in_house: unavailable } });
  vi.mocked(catalogueApi.getEstimationCatalogue).mockResolvedValue(catalogue());
});

describe("Main Line Client view entry point", () => {
  it("shows persisted existing Signature wording in Functional preview after automatic initialization", async () => {
    let initialized = false;
    const text = "Existing saved ceiling description";
    vi.mocked(api.getKnowledgeItem).mockImplementation(async () => ({ ...item, version: initialized ? 10 : 9 }));
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (mainLineId, revisionId, sectionKey, options): Promise<KnowledgeSectionEnvelope> => ({
      ...metadata, id: `${revisionId}-${sectionKey}`, mainLineId, revisionId, sectionKey, applicability: "configured", version: sectionKey === "advanced" && initialized ? 5 : 4,
      payload: sectionKey === "overview" ? { applicableTiers: ["signature", "functional"] }
        : sectionKey === "advanced" && (options?.modeTier === undefined || options.modeTier === "functional" && initialized) ? { modeDescription: text } : {},
      ...(options?.modeTier ? { modeTier: options.modeTier } : {})
    }));
    vi.mocked(catalogueApi.getEstimationCatalogue).mockImplementation(async () => catalogue("Saved ceiling", {
      applicableTiers: ["signature", "functional"], tierDescriptions: { signature: text, functional: initialized ? text : null }
    }));
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementation(async (mainLineId, revisionId) => {
      initialized = true;
      return { mainLineId, revisionId, version: 5, aggregateVersion: 10, sourceTier: "signature", copiedTiers: ["functional"] };
    });
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole("button", { name: "Client view" });
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(screen.getByRole("radio", { name: "Functional Mode" }));
    expect(await screen.findByRole("textbox", { name: "Description" })).toHaveValue(text);
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Client view" }));
    const drawer = await screen.findByRole("dialog", { name: "Client view" });
    await within(drawer).findByText("Saved ceiling");
    await user.click(within(drawer).getByRole("radio", { name: /Functional/ }));
    expect(within(drawer).getByText(text)).toBeVisible();
    expect(within(drawer).getByRole("region", { name: /^Functional description for/ }).textContent).toBe(text);
    expect(within(drawer).queryByText(/^(Description|Internal specifications|Internal information)$/)).not.toBeInTheDocument();
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(1);
  });

  it("reloads copied saved descriptions after a first save and displays only the preview's selected tier", async () => {
    let savedDescription: string | null = null;
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (mainLineId, revisionId, sectionKey, options): Promise<KnowledgeSectionEnvelope> => ({
      ...metadata, id: `${revisionId}-${sectionKey}`, mainLineId, revisionId, sectionKey,
      applicability: "configured", version: savedDescription ? 5 : 4,
      payload: sectionKey === "overview" ? { applicableTiers: ["signature", "functional"] }
        : sectionKey === "advanced" && options?.modeTier !== "default" && savedDescription ? { modeDescription: savedDescription } : {},
      ...(options?.modeTier ? { modeTier: options.modeTier } : {})
    }));
    vi.mocked(catalogueApi.getEstimationCatalogue).mockImplementation(async () => catalogue("Saved ceiling", {
      applicableTiers: ["signature", "functional"],
      tierDescriptions: { signature: savedDescription, functional: savedDescription, premium: "Independent Premium wording" }
    }));
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (mainLineId, revisionId, sectionKey, input) => {
      savedDescription = input.payload.modeDescription as string;
      vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...item, version: 10 });
      return { ...metadata, id: `${revisionId}-${sectionKey}`, mainLineId, revisionId, sectionKey,
        applicability: "configured", version: 5, aggregateVersion: 10, payload: input.payload };
    });
    const user = userEvent.setup(); renderWorkspace();
    const trigger = await screen.findByRole("button", { name: "Client view" });
    await user.click(trigger);
    let drawer = await screen.findByRole("dialog", { name: "Client view" });
    await within(drawer).findByText("Saved ceiling");
    expect(within(drawer).queryByText("Copied ceiling description")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(screen.getByRole("radio", { name: "Signature Mode" }));
    const mode = await screen.findByRole("region", { name: "Signature Mode" });
    await user.type(await within(mode).findByRole("textbox", { name: "Description" }), "Copied ceiling description");
    await user.click(within(mode).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(mode).getByRole("button", { name: "Save" })).toBeDisabled());
    await user.click(trigger);
    drawer = await screen.findByRole("dialog", { name: "Client view" });
    expect(await within(drawer).findByText("Copied ceiling description")).toBeVisible();
    expect(within(drawer).getByRole("region", { name: /description for/ }).textContent).toBe("Copied ceiling description");
    await user.click(within(drawer).getByRole("radio", { name: /Functional/ }));
    expect(within(drawer).getByText("Copied ceiling description")).toBeVisible();
    expect(within(drawer).getByRole("region", { name: /^Functional description for/ }).textContent).toBe("Copied ceiling description");
    expect(within(drawer).queryByText("Independent Premium wording")).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/^(Description|Internal specifications|Internal information)$/)).not.toBeInTheDocument();
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(catalogueApi.getEstimationCatalogue).toHaveBeenCalledTimes(2);
  });

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
