import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KNOWLEDGE_MODE_CONFIGURATION_SCOPES, type KnowledgeModeConfigurationScope } from "../../../../shared/knowledge/knowledgeModeTiers";
import { ApiError } from "../../api/client";
import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeMaster, KnowledgeRevision, KnowledgeSectionEnvelope, KnowledgeSectionKey } from "./knowledgeTypes";

const permissions = vi.hoisted(() => ({ editable: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", authorization: {}, user: { id: "configuration-admin", role: "super_admin" } }) }));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: (_auth: unknown, operation: string) => permissions.editable || operation.endsWith(".read") }));
vi.mock("./knowledgeApi", async original => ({ ...await original<typeof import("./knowledgeApi")>(),
  getKnowledgeItem: vi.fn(), getKnowledgeHistory: vi.fn(), getKnowledgeSection: vi.fn(), updateKnowledgeSection: vi.fn(), initializeKnowledgeTierDescriptions: vi.fn(),
  listKnowledgeItems: vi.fn(), listKnowledgeBaskets: vi.fn(), listKnowledgeMasters: vi.fn(), listKnowledgeSubBaskets: vi.fn(),
  getKnowledgeBasketQuality: vi.fn(), listKnowledgeQualityControlOptions: vi.fn(), getKnowledgeSubBasketMargins: vi.fn(),
  listKnowledgeSpecificationItemNames: vi.fn()
}));

const metadata = { createdById: "configuration-admin", updatedById: "configuration-admin", createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z" };
const completeness = { percentage: 30, sections: [], blockers: [], warnings: [] };
const pagination = { limit: 100, offset: 0, total: 0, hasMore: false };
const uom: KnowledgeMaster = { ...metadata, id: "sqft", masterType: "uoms", code: "SQFT", name: "sq ft", decimalScale: 2,
  description: null, displayOrder: 1, status: "active", version: 1 };
function makeItem(id: string): KnowledgeItemDetail {
  const revision: KnowledgeRevision = { ...metadata, id: `draft-${id}`, mainLineId: id, revisionNumber: 1, status: "draft", sourceRevisionId: null,
    contentDigest: null, completeness, activatedAt: null, activatedById: null, supersededAt: null, supersededById: null, version: 1 };
  return { ...metadata, id, mainLineId: id, mainLineName: id === "line-a" ? "Ceiling A" : "Wall B", itemType: "main_line", completionRequired: false,
    basketId: "basket", basketName: "Interiors", subBasketId: "sub", subBasketName: "Finishes", description: null, status: "draft",
    activeRevisionId: null, draftRevisionId: revision.id, revisionNumber: 1, uomId: "sqft", priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [],
    completeness, allowedActions: ["update_section"], activeRevision: null, draftRevision: revision, blockers: [], warnings: [], version: 10 };
}
interface StoredLine {
  item: KnowledgeItemDetail;
  overview: KnowledgeJsonObject;
  advanced: Record<KnowledgeModeConfigurationScope, KnowledgeJsonObject>;
  pricing: Record<KnowledgeModeConfigurationScope, KnowledgeJsonObject>;
  versions: Record<string, number>;
}
let store: Map<string, StoredLine>;
function section(id: string, revisionId: string, sectionKey: KnowledgeSectionKey, scope: KnowledgeModeConfigurationScope = "signature"): KnowledgeSectionEnvelope {
  const row = store.get(id)!;
  const scoped = sectionKey === "advanced" || sectionKey === "pricing";
  const payload = scoped ? row[sectionKey][scope] : sectionKey === "overview" ? row.overview : {};
  return { ...metadata, id: `${revisionId}-${sectionKey}`, mainLineId: id, revisionId, sectionKey,
    version: row.versions[sectionKey] ?? 1, applicability: Object.keys(payload).length ? "configured" : "not_configured",
    payload: structuredClone(payload), ...(scoped && scope !== "signature" ? { modeTier: scope } : {}) };
}
function renderWorkspace(gcTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/configuration/line-a"]}>
    <Link to="/configuration/line-a">Open first line</Link><Link to="/configuration/line-b">Open other line</Link>
    <Routes><Route path="/configuration/:itemId" element={<main><KnowledgeItemWorkspacePage /></main>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return { ...result, client };
}
const modeTabs = () => within(screen.getByRole("tablist", { name: "Configuration sections" })).getAllByRole("tab").map(tab => tab.textContent);
async function selectMode(user: ReturnType<typeof userEvent.setup>, label: string) {
  const parent = await screen.findByRole("tab", { name: "Mode" });
  if (label === "Mode" || parent.getAttribute("aria-selected") !== "true") await user.click(parent);
  if (label !== "Mode") {
    const radio = within(screen.getByRole("radiogroup", { name: "Mode selection" })).getByRole("radio", { name: label }) as HTMLInputElement;
    if (!radio.checked) await user.click(radio);
  }
  return screen.getByRole(label === "Mode" ? "tabpanel" : "region", { name: label });
}
async function openMode(user: ReturnType<typeof userEvent.setup>, label: string) {
  const panel = await selectMode(user, label);
  await within(panel).findByRole("checkbox", { name: "PMC" });
  return panel;
}
async function setDescription(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, value: string, persist = true) {
  const input = await within(panel).findByRole("textbox", { name: "Description" });
  await user.clear(input); await user.type(input, value);
  if (persist) await user.click(within(panel).getByRole("button", { name: "Save" }));
}

async function setDefaultMargin(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) {
  const pmc = within(panel).getByRole("checkbox", { name: "PMC" }) as HTMLInputElement;
  if (!pmc.checked) await user.click(pmc);
  for (const [label, value] of [["Min.", "10"], ["Max.", "18"]] as const) {
    const input = within(panel).getByRole("spinbutton", { name: `${label} PMC Margin (%)` });
    await user.clear(input); await user.type(input, value);
  }
}

beforeEach(() => {
  vi.clearAllMocks(); permissions.editable = true;
  store = new Map(["line-a", "line-b"].map((id, lineIndex) => [id, {
    item: makeItem(id), overview: { uomId: "sqft", applicableTiers: ["signature", "premium", "functional"] },
    advanced: Object.fromEntries(KNOWLEDGE_MODE_CONFIGURATION_SCOPES.map(scope => [scope,
      scope === "default" && id === "line-a" ? {} : { modeDescription: `${scope} saved ${id}`, pmcMarginBps: 1000 + lineIndex * 100 }])) as StoredLine["advanced"],
    pricing: Object.fromEntries(KNOWLEDGE_MODE_CONFIGURATION_SCOPES.map(scope => [scope, {}])) as StoredLine["pricing"], versions: { overview: 3, advanced: 4, pricing: 5 }
  }]));
  vi.mocked(api.getKnowledgeItem).mockImplementation(async id => structuredClone(store.get(id)!.item));
  vi.mocked(api.getKnowledgeHistory).mockResolvedValue({ items: [], pagination });
  vi.mocked(api.getKnowledgeSection).mockImplementation(async (id, revisionId, key, options) => section(id, revisionId, key, options?.modeTier));
  vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementation(async (id, revisionId) => ({
    mainLineId: id, revisionId, version: store.get(id)!.versions.advanced!, aggregateVersion: store.get(id)!.item.version,
    sourceTier: null, copiedTiers: []
  }));
  vi.mocked(api.updateKnowledgeSection).mockImplementation(async (id, revisionId, key, input) => {
    const row = store.get(id)!;
    if (input.expectedVersion !== row.versions[key] || input.expectedAggregateVersion !== row.item.version) throw new ApiError(409, "VERSION_CONFLICT", "Configuration changed.");
    if (key === "overview") row.overview = structuredClone(input.payload);
    else if (key === "advanced" || key === "pricing") row[key][input.modeTier ?? "signature"] = structuredClone(input.payload);
    row.versions[key] = (row.versions[key] ?? 1) + 1;
    row.item = { ...row.item, version: row.item.version + 1 };
    return { ...section(id, revisionId, key, input.modeTier), aggregateVersion: row.item.version };
  });
  vi.mocked(api.listKnowledgeMasters).mockImplementation(async type => ({ items: type === "uoms" ? [uom] : [], pagination }));
  for (const read of [api.listKnowledgeItems, api.listKnowledgeBaskets, api.listKnowledgeSubBaskets]) vi.mocked(read).mockResolvedValue({ items: [], pagination });
  vi.mocked(api.getKnowledgeBasketQuality).mockResolvedValue({ basketId: "basket", basketName: "Interiors", basketStatus: "active", version: 1,
    revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null });
  vi.mocked(api.listKnowledgeQualityControlOptions).mockResolvedValue({ items: [] });
  vi.mocked(api.listKnowledgeSpecificationItemNames).mockResolvedValue({ items: [], pagination: { ...pagination, limit: 20 }, exactMatch: null, similarItems: [] });
  const absent = { ranges: [], mismatchCount: null, mismatches: [], canApply: false, unavailableReason: "Not configured" };
  vi.mocked(api.getKnowledgeSubBasketMargins).mockResolvedValue({ basketId: "basket", subBasketId: "sub", source: null, sourceConfiguration: null,
    totalMainLines: 2, versionToken: "synthetic", modes: { pmc: absent, sub_vendor: absent, in_house: absent } });
});

describe("independent Configuration modes", () => {
  it("copies an already-saved Signature description on entry without Save clicks, then reopens independent descriptions", async () => {
    const row = store.get("line-a")!;
    row.advanced.signature = { modeDescription: "Previously saved Signature wording", pmcMarginBps: 1200 };
    row.advanced.premium = { pmcMarginBps: 1400 };
    row.advanced.functional = { modeDescription: null, pmcMarginBps: 1100 };
    const originalDefault = structuredClone(row.advanced.default);
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockImplementationOnce(async (id, revisionId, input) => {
      expect(input).toEqual({ expectedVersion: 4, expectedAggregateVersion: 10 });
      row.advanced.premium = { ...row.advanced.premium, modeDescription: "Previously saved Signature wording" };
      row.advanced.functional = { ...row.advanced.functional, modeDescription: "Previously saved Signature wording" };
      row.versions.advanced = 5; row.item = { ...row.item, version: 11 };
      return { mainLineId: id, revisionId, version: 5, aggregateVersion: 11,
        sourceTier: "signature", copiedTiers: ["premium", "functional"] };
    });
    const user = userEvent.setup(); let view = renderWorkspace(60_000);
    const premium = await openMode(user, "Premium Mode");
    expect(await within(premium).findByRole("textbox", { name: "Description" })).toHaveValue("Previously saved Signature wording");
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    const functional = await openMode(user, "Functional Mode");
    expect(await within(functional).findByRole("textbox", { name: "Description" })).toHaveValue("Previously saved Signature wording");
    expect(within(functional).getByRole("button", { name: "Save" })).toBeDisabled();
    await setDescription(user, functional, "Independent Functional wording");
    view.unmount(); view.client.clear(); view = renderWorkspace();
    const reopened = await openMode(user, "Functional Mode");
    expect(await within(reopened).findByRole("textbox", { name: "Description" })).toHaveValue("Independent Functional wording");
    expect(row.advanced.signature.modeDescription).toBe("Previously saved Signature wording");
    expect(row.advanced.premium.modeDescription).toBe("Previously saved Signature wording");
    expect(row.advanced.default).toEqual(originalDefault);
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it("keeps the named editor closed on initialization failure and opens it after explicit retry", async () => {
    vi.mocked(api.initializeKnowledgeTierDescriptions).mockRejectedValueOnce(new Error("Initialization unavailable"));
    const user = userEvent.setup(); renderWorkspace();
    await selectMode(user, "Premium Mode");
    expect(await screen.findByText("Initialization unavailable")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("textbox", { name: "Description" })).toHaveValue("premium saved line-a");
    expect(api.initializeKnowledgeTierDescriptions).toHaveBeenCalledTimes(2);
  });

  it("does not initialize default Mode, read-only named tiers, or active-only revisions", async () => {
    const user = userEvent.setup(); let view = renderWorkspace();
    await openMode(user, "Mode");
    expect(api.initializeKnowledgeTierDescriptions).not.toHaveBeenCalled();
    view.unmount(); view.client.clear(); permissions.editable = false; view = renderWorkspace();
    await openMode(user, "Signature Mode");
    expect(api.initializeKnowledgeTierDescriptions).not.toHaveBeenCalled();
    view.unmount(); view.client.clear(); permissions.editable = true;
    const row = store.get("line-a")!;
    row.item = { ...row.item, activeRevision: { ...row.item.draftRevision!, status: "active" }, draftRevision: null,
      activeRevisionId: row.item.draftRevisionId, draftRevisionId: null, status: "active", allowedActions: ["create_revision"] };
    view = renderWorkspace();
    await openMode(user, "Signature Mode");
    expect(api.initializeKnowledgeTierDescriptions).not.toHaveBeenCalled();
  });

  it("shows one empty inline textarea in common Mode and named tiers without generating or saving wording", async () => {
    const row = store.get("line-a")!;
    for (const scope of KNOWLEDGE_MODE_CONFIGURATION_SCOPES) row.advanced[scope] = {};
    const before = structuredClone(row.advanced);
    const user = userEvent.setup();
    renderWorkspace();
    for (const label of ["Mode", "Signature Mode", "Premium Mode", "Functional Mode"]) {
      const panel = await openMode(user, label);
      const input = await within(panel).findByRole("textbox", { name: "Description" });
      expect(input).toHaveValue("");
      expect(within(panel).getAllByRole("textbox", { name: "Description" })).toHaveLength(1);
      expect(within(panel).queryByRole("button", { name: "Edit Description" })).not.toBeInTheDocument();
      expect(within(panel).queryByRole("region", { name: "Description preview" })).not.toBeInTheDocument();
      expect(within(panel).queryByText(/Providing, Supplying/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Save ${label}` })).toBeDisabled();
    }
    expect(store.get("line-a")!.advanced).toEqual(before);
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("saves and reopens common Mode wording independently from tiers and other Main Lines", async () => {
    const before = structuredClone(store);
    const user = userEvent.setup(); let view = renderWorkspace();
    const common = await openMode(user, "Mode");
    const input = await within(common).findByRole("textbox", { name: "Description" });
    expect(input).toHaveValue("");
    expect(within(screen.getByRole("radiogroup", { name: "Mode selection" })).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(input.compareDocumentPosition(within(common).getByRole("checkbox", { name: "PMC" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await setDescription(user, common, "Shared execution description");
    await waitFor(() => expect(store.get("line-a")!.advanced.default.modeDescription).toBe("Shared execution description"));
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]).toEqual([
      "line-a", "draft-line-a", "advanced", expect.objectContaining({ modeTier: "default", payload: { modeDescription: "Shared execution description" } })
    ]);
    const signature = await openMode(user, "Signature Mode");
    expect(await within(signature).findByRole("textbox", { name: "Description" })).toHaveValue("signature saved line-a");
    const returned = await openMode(user, "Mode");
    expect(await within(returned).findByRole("textbox", { name: "Description" })).toHaveValue("Shared execution description");
    view.unmount(); view.client.clear(); view = renderWorkspace();
    const reopened = await openMode(user, "Mode");
    expect(await within(reopened).findByRole("textbox", { name: "Description" })).toHaveValue("Shared execution description");
    expect(within(reopened).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("link", { name: "Open other line" }));
    await screen.findByRole("heading", { level: 1, name: "Wall B" });
    const other = await openMode(user, "Mode");
    expect(await within(other).findByRole("textbox", { name: "Description" })).toHaveValue("default saved line-b");
    for (const scope of ["signature", "premium", "functional"] as const) {
      expect(store.get("line-a")!.advanced[scope]).toEqual(before.get("line-a")!.advanced[scope]);
    }
    expect(store.get("line-b")).toEqual(before.get("line-b"));
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it("guards unapplied inline text and discards it before opening another tier", async () => {
    const user = userEvent.setup(); renderWorkspace();
    const signature = await openMode(user, "Signature Mode");
    const input = await within(signature).findByRole("textbox", { name: "Description" });
    await user.clear(input); await user.type(input, "Unapplied Signature wording");
    await user.click(screen.getByRole("radio", { name: "Premium Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay here" }));
    expect(input).toHaveValue("Unapplied Signature wording");
    expect(screen.getByRole("radio", { name: "Signature Mode" })).toBeChecked();
    expect(store.get("line-a")!.advanced.signature.modeDescription).toBe("signature saved line-a");
    await user.click(screen.getByRole("radio", { name: "Premium Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    const premium = await within(screen.getByRole("region", { name: "Premium Mode" })).findByRole("textbox", { name: "Description" });
    expect(premium).toHaveValue("premium saved line-a");
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    expect(screen.queryByDisplayValue("Unapplied Signature wording")).not.toBeInTheDocument();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("shows each Main Line's basket context in Sub-Vendor across the main and tier editors without saving", async () => {
    const other = store.get("line-b")!;
    other.item = { ...other.item, basketId: "basket-electrical", basketName: "Electrical", subBasketId: "sub-lighting", subBasketName: "Lighting" };
    const original = structuredClone(store);
    const user = userEvent.setup(); renderWorkspace();
    for (const [lineId, basketName, subBasketName] of [
      ["line-a", "Interiors", "Finishes"],
      ["line-b", "Electrical", "Lighting"]
    ] as const) {
      if (lineId === "line-b") {
        await user.click(screen.getByRole("link", { name: "Open other line" }));
        await screen.findByRole("heading", { level: 1, name: "Wall B" });
      }
      for (const label of ["Mode", "Signature Mode", "Premium Mode", "Functional Mode"]) {
        const panel = within(await openMode(user, label));
        const execution = panel.getByRole("checkbox", { name: "Execution" }) as HTMLInputElement;
        if (!execution.checked) await user.click(execution);
        const source = panel.getByRole("checkbox", { name: "Sub-Vendor" }) as HTMLInputElement;
        if (!source.checked) await user.click(source);
        const context = within(panel.getByRole("region", { name: "Sub-Vendor" }));
        expect(context.getByText("Main Basket")).toBeVisible();
        expect(context.getByText(basketName)).toBeVisible();
        expect(context.getByText("Sub Basket")).toBeVisible();
        expect(context.getByText(subBasketName)).toBeVisible();
        expect(context.queryByText(lineId === "line-a" ? "Electrical" : "Interiors")).not.toBeInTheDocument();
      }
    }
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    expect(store).toEqual(original);
  });

  it("groups saved tiers as exclusive native radios under one Mode entry at every width", async () => {
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole("switch", { name: "Applicable tiers" });
    const expectedSections = ["Overview", "Mode", "Recommendation & Exclusions", "Quality Parameter", "Design", "Basket closure priority"];
    expect(modeTabs()).toEqual(expectedSections);
    const selector = screen.getByRole("combobox", { name: "Configuration section" });
    expect(within(selector).getAllByRole("option").map(option => option.textContent)).toEqual(expectedSections);
    expect(screen.queryByRole("radiogroup", { name: "Mode selection" })).not.toBeInTheDocument();
    await user.selectOptions(selector, "mode");
    const inner = screen.getByRole("radiogroup", { name: "Mode selection" });
    const labels = ["Signature Mode", "Premium Mode", "Functional Mode"];
    const radios = within(inner).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    labels.forEach((label, index) => expect(radios[index]).toHaveAccessibleName(label));
    expect(radios.every(radio => radio.tagName === "INPUT" && radio.type === "radio")).toBe(true);
    expect(new Set(radios.map(radio => radio.name)).size).toBe(1);
    expect(within(inner).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(within(inner).getByRole("radio", { name: "Signature Mode" })).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("tablist", { name: "Mode selection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Configuration mode" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Default Mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Default Mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to Mode" })).not.toBeInTheDocument();
    await user.click(within(inner).getByRole("radio", { name: "Signature Mode" }));
    expect(await within(screen.getByRole("region", { name: "Signature Mode" })).findByRole("textbox", { name: "Description" })).toHaveValue("signature saved line-a");
    expect(within(inner).getAllByRole("radio", { checked: true })).toEqual([radios[0]]);
    expect(screen.getByRole("button", { name: "Save Signature Mode" })).toBeDisabled();
    expect(store.get("line-a")!.advanced.signature.modeDescription).toBe("signature saved line-a");
    await user.click(within(inner).getByRole("radio", { name: "Premium Mode" }));
    expect(await within(screen.getByRole("region", { name: "Premium Mode" })).findByRole("textbox", { name: "Description" })).toHaveValue("premium saved line-a");
    expect(within(inner).getAllByRole("radio", { checked: true })).toEqual([radios[1]]);
    expect(screen.getByRole("button", { name: "Save Premium Mode" })).toBeDisabled();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(selector).toHaveValue("mode");
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("applies saved tier subsets and preserves hidden configurations when toggled off and on", async () => {
    const user = userEvent.setup(); let view = renderWorkspace();
    const originalModes = structuredClone(store.get("line-a")!.advanced);
    await user.click(await screen.findByRole("checkbox", { name: "Signature" }));
    expect(store.get("line-a")!.overview.applicableTiers).toEqual(["signature", "premium", "functional"]);
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(store.get("line-a")!.overview.applicableTiers).toEqual(["premium", "functional"]));
    await openMode(user, "Premium Mode");
    expect(screen.queryByRole("radio", { name: "Signature Mode" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(await screen.findByRole("switch", { name: "Applicable tiers" }));
    expect(screen.queryByRole("checkbox", { name: "Premium" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(store.get("line-a")!.overview.applicableTiers).toEqual([]));
    expect(store.get("line-a")!.advanced).toEqual(originalModes);
    view.unmount(); view.client.clear(); view = renderWorkspace();
    expect(await screen.findByRole("switch", { name: "Applicable tiers" })).not.toBeChecked();
    await openMode(user, "Mode");
    expect(screen.queryByRole("radiogroup", { name: "Mode selection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Configuration mode" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    await user.click(await screen.findByRole("switch", { name: "Applicable tiers" }));
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(store.get("line-a")!.overview.applicableTiers).toEqual(["signature", "premium", "functional"]));
    const signature = await openMode(user, "Signature Mode");
    expect(await within(signature).findByRole("textbox", { name: "Description" })).toHaveValue("signature saved line-a");
    expect(store.get("line-a")!.advanced).toEqual(originalModes);
  });

  it("retains saved mode availability and the local toggle choice when Overview save fails", async () => {
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("switch", { name: "Applicable tiers" }));
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Overview unavailable"));
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    expect(await screen.findByText("Overview unavailable")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Applicable tiers" })).not.toBeChecked();
    expect(store.get("line-a")!.overview.applicableTiers).toEqual(["signature", "premium", "functional"]);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    expect(within(screen.getByRole("radiogroup", { name: "Mode selection" })).getAllByRole("radio")).toHaveLength(3);
    expect(store.get("line-a")!.overview.applicableTiers).toEqual(["signature", "premium", "functional"]);
  });

  it("saves unequal tier descriptions without changing common wording or another Main Line", async () => {
    const user = userEvent.setup(); let view = renderWorkspace();
    const scopes = ["signature", "premium", "functional"] as const;
    const labels = ["Signature Mode", "Premium Mode", "Functional Mode"];
    store.get("line-a")!.advanced.default = { modeDescription: "Saved common wording" };
    const untouchedCommon = structuredClone(store.get("line-a")!.advanced.default);
    const untouchedOther = structuredClone(store.get("line-b")!);
    for (const [index, label] of labels.entries()) {
      const panel = await openMode(user, label);
      await setDescription(user, panel, `Distinct ${label} configuration ${index}`);
      expect(within(panel).getByRole("textbox", { name: "Description" })).toHaveValue(`Distinct ${label} configuration ${index}`);
      await waitFor(() => expect(screen.getByRole("button", { name: `Save ${label}` })).toBeDisabled());
      expect(store.get("line-a")!.advanced[scopes[index]!].modeDescription).toBe(`Distinct ${label} configuration ${index}`);
    }
    expect(store.get("line-a")!.advanced.default).toEqual(untouchedCommon);
    expect(store.get("line-b")).toEqual(untouchedOther);
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls.map(([, , key, input]) => [key, input.modeTier ?? "signature"]))
      .toEqual(scopes.map(scope => ["advanced", scope]));
    view.unmount(); view.client.clear(); view = renderWorkspace();
    for (const [index, label] of labels.entries()) {
      const panel = await openMode(user, label);
      expect(await within(panel).findByRole("textbox", { name: "Description" })).toHaveValue(`Distinct ${label} configuration ${index}`);
      expect(store.get("line-a")!.advanced[scopes[index]!].modeDescription).toBe(`Distinct ${label} configuration ${index}`);
      expect(screen.getByRole("button", { name: `Save ${label}` })).toBeDisabled();
    }
    const common = await openMode(user, "Mode");
    expect(await within(common).findByRole("textbox", { name: "Description" })).toHaveValue("Saved common wording");
    expect(store.get("line-a")!.advanced.default).toEqual(untouchedCommon);
    await user.click(screen.getByRole("link", { name: "Open other line" }));
    await screen.findByRole("heading", { level: 1, name: "Wall B" });
    for (const [index, label] of labels.entries()) {
      const otherPanel = await openMode(user, label);
      expect(await within(otherPanel).findByRole("textbox", { name: "Description" })).toHaveValue(`${scopes[index]} saved line-b`);
      expect(within(otherPanel).queryByDisplayValue(/Distinct/)).not.toBeInTheDocument();
    }
    expect(store.get("line-b")).toEqual(untouchedOther);
    await user.click(screen.getByRole("link", { name: "Open first line" }));
    await screen.findByRole("heading", { level: 1, name: "Ceiling A" });
    const reopened = await openMode(user, "Signature Mode");
    expect(await within(reopened).findByRole("textbox", { name: "Description" })).toHaveValue("Distinct Signature Mode configuration 0");
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(3);
  });

  it("retains an explicitly cleared tier description after switching and reopening", async () => {
    const user = userEvent.setup(); let view = renderWorkspace();
    store.get("line-a")!.advanced.default = { modeDescription: "Common wording stays separate" };
    const signature = await openMode(user, "Signature Mode");
    await user.clear(await within(signature).findByRole("textbox", { name: "Description" }));
    await user.click(within(signature).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(store.get("line-a")!.advanced.signature.modeDescription).toBe(""));
    const premium = await openMode(user, "Premium Mode");
    expect(await within(premium).findByRole("textbox", { name: "Description" })).toHaveValue("premium saved line-a");
    view.unmount(); view.client.clear(); view = renderWorkspace();
    const reopened = await openMode(user, "Signature Mode");
    expect(await within(reopened).findByRole("textbox", { name: "Description" })).toHaveValue("");
    expect(within(reopened).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(store.get("line-a")!.advanced.default.modeDescription).toBe("Common wording stays separate");
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["signature", "Signature Mode", "functional", "Functional Mode"],
    ["premium", "Premium Mode", "signature", "Signature Mode"]
  ] as const)("refreshes a cached sibling after a %s description save and keeps later edits independent", async (source, sourceLabel, target, targetLabel) => {
    const row = store.get("line-a")!;
    row.overview = { ...row.overview, applicableTiers: [source, target] };
    row.advanced[source] = { pmcMarginBps: 1000 };
    row.advanced[target] = { pmcMarginBps: 900 };
    row.advanced.default = { modeDescription: "Common wording remains separate" };
    const otherLine = structuredClone(store.get("line-b"));
    const saveSelected = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    // Model the committed backend result; its response still contains only the requested tier.
    vi.mocked(api.updateKnowledgeSection).mockImplementationOnce(async (...args) => {
      const result = await saveSelected(...args);
      row.advanced[target] = { ...row.advanced[target], modeDescription: "Shared first description" };
      return result;
    });
    const user = userEvent.setup(); let view = renderWorkspace(60_000);
    const empty = await openMode(user, targetLabel);
    expect(await within(empty).findByRole("textbox", { name: "Description" })).toHaveValue("");
    const sourcePanel = await openMode(user, sourceLabel);
    await setDescription(user, sourcePanel, "Shared first description", false);
    const save = within(sourcePanel).getByRole("button", { name: "Save" });
    save.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(save).toBeDisabled());
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier ?? "signature").toBe(source);
    const copied = await openMode(user, targetLabel);
    await waitFor(() => expect(within(copied).getByRole("textbox", { name: "Description" })).toHaveValue("Shared first description"));
    expect(within(copied).getByRole("button", { name: "Save" })).toBeDisabled();
    await setDescription(user, copied, "Independent destination wording");
    const returned = await openMode(user, sourceLabel);
    expect(await within(returned).findByRole("textbox", { name: "Description" })).toHaveValue("Shared first description");
    await setDescription(user, returned, "Later source wording");
    view.unmount(); view.client.clear(); view = renderWorkspace();
    const reopened = await openMode(user, targetLabel);
    expect(await within(reopened).findByRole("textbox", { name: "Description" })).toHaveValue("Independent destination wording");
    expect(row.advanced[source].modeDescription).toBe("Later source wording");
    expect(row.advanced.default.modeDescription).toBe("Common wording remains separate");
    expect(store.get("line-b")).toEqual(otherLine);
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(3);
  });

  it("preserves a filled and a deliberately cleared sibling after another tier's first description save", async () => {
    const row = store.get("line-a")!;
    row.advanced.signature = { pmcMarginBps: 1000 };
    row.advanced.functional = { ...row.advanced.functional, modeDescription: "" };
    const user = userEvent.setup(); renderWorkspace();
    const signature = await openMode(user, "Signature Mode");
    await setDescription(user, signature, "First Signature wording");
    const premium = await openMode(user, "Premium Mode");
    expect(await within(premium).findByRole("textbox", { name: "Description" })).toHaveValue("premium saved line-a");
    const functional = await openMode(user, "Functional Mode");
    expect(await within(functional).findByRole("textbox", { name: "Description" })).toHaveValue("");
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it("does not display copied wording after cancellation or a failed first save", async () => {
    const row = store.get("line-a")!;
    row.overview = { ...row.overview, applicableTiers: ["signature", "functional"] };
    row.advanced.signature = { pmcMarginBps: 1000 };
    row.advanced.functional = { pmcMarginBps: 900 };
    const user = userEvent.setup(); renderWorkspace();
    let signature = await openMode(user, "Signature Mode");
    await setDescription(user, signature, "Canceled description", false);
    await user.click(within(signature).getByRole("button", { name: "Cancel" }));
    let functional = await openMode(user, "Functional Mode");
    expect(await within(functional).findByRole("textbox", { name: "Description" })).toHaveValue("");
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    signature = await openMode(user, "Signature Mode");
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Save unavailable"));
    await setDescription(user, signature, "Keep this failed edit");
    expect(await within(signature).findByText("Unable to save the description. Please try again.")).toBeVisible();
    expect(within(signature).getByRole("textbox", { name: "Description" })).toHaveValue("Keep this failed edit");
    await user.click(within(signature).getByRole("button", { name: "Cancel" }));
    functional = await openMode(user, "Functional Mode");
    expect(await within(functional).findByRole("textbox", { name: "Description" })).toHaveValue("");
    expect(row.advanced.functional.modeDescription).toBeUndefined();
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it("guards unsaved default edits and does not close a dirty Signature mode when applicability changes", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Mode");
    await setDefaultMargin(user, panel);
    await user.click(screen.getByRole("radio", { name: "Signature Mode" }));
    const dialog = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(dialog).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Signature Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    const signature = screen.getByRole("region", { name: "Signature Mode" });
    await within(signature).findByRole("textbox", { name: "Description" });
    await setDescription(user, signature, "Unsaved Signature description", false);
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), {
      ...section("line-a", "draft-line-a", "overview"), payload: { uomId: "sqft", applicableTiers: [] }
    }); });
    expect(screen.getByRole("radio", { name: "Signature Mode" })).toBeChecked();
    expect(screen.getByDisplayValue("Unsaved Signature description")).toBeVisible();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("returns a hidden clean tier to Mode and keeps outer and inner keyboard navigation separate", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const overview = await screen.findByRole("tab", { name: "Overview" }); overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
    const signature = screen.getByRole("radio", { name: "Signature Mode" });
    expect(signature).toHaveAttribute("tabindex", "0");
    expect(signature).not.toBeChecked();
    signature.focus();
    await user.keyboard(" ");
    expect(signature).toHaveFocus();
    await within(screen.getByRole("region", { name: "Signature Mode" })).findByRole("textbox", { name: "Description" });
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), {
      ...section("line-a", "draft-line-a", "overview"), payload: { uomId: "sqft", applicableTiers: [] }
    }); });
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Signature Mode" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(screen.queryByRole("radiogroup", { name: "Mode selection" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeDisabled();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("keeps the default draft on repeated parent activation and retains an inner scope on Overview refetch", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Mode");
    await setDefaultMargin(user, panel);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(within(panel).getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(18);
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
    expect(within(screen.getByRole("radiogroup", { name: "Mode selection" })).getAllByRole("radio").every(radio => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Premium Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    const premium = screen.getByRole("region", { name: "Premium Mode" });
    await within(premium).findByRole("textbox", { name: "Description" });
    await setDescription(user, premium, "Pending Premium description", false);
    await act(async () => { await view.client.invalidateQueries({ queryKey: knowledgeQueryKeys.section("line-a", "draft-line-a", "overview") }); });
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByDisplayValue("Pending Premium description")).toBeVisible();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("preserves the selected radio and focus when a keyboard change is cancelled or blocked by a save", async () => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDefaultMargin(user, panel);
    const group = screen.getByRole("radiogroup", { name: "Mode selection" });
    const premium = within(group).getByRole("radio", { name: "Premium Mode" });
    const functional = within(group).getByRole("radio", { name: "Functional Mode" });
    premium.focus(); await user.keyboard("{ArrowDown}");
    expect(within(group).getAllByRole("radio", { checked: true })).toEqual([premium]);
    expect(functional).not.toBeChecked();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay here" }));
    await waitFor(() => expect(premium).toHaveFocus());
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(18);
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    const save = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (...args) => { await gate; return save(...args); });
    await user.click(screen.getByRole("button", { name: "Save Premium Mode" }));
    await screen.findByRole("button", { name: "Saving Premium Mode…" });
    premium.focus(); await user.keyboard("{ArrowRight}");
    expect(premium).toHaveFocus();
    expect(within(group).getAllByRole("radio", { checked: true })).toEqual([premium]);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => finishSave());
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Premium Mode" })).toBeDisabled());
    await user.keyboard("{ArrowDown}");
    expect(functional).toHaveFocus();
    expect(within(group).getAllByRole("radio", { checked: true })).toEqual([functional]);
    expect(await within(screen.getByRole("region", { name: "Functional Mode" })).findByRole("textbox", { name: "Description" })).toHaveValue("functional saved line-a");
    expect(store.get("line-a")!.advanced.premium.pmcMarginBps).toBe(1800);
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier).toBe("premium");
  });

  it.each(["parent tab", "mobile action", "selected radio", "selected radio Space"])("returns a clean tier to the independent Mode screen through the %s", async action => {
    store.get("line-a")!.advanced.default = { modeDescription: "Independent default settings", pmcMinimumMarginBps: 1000, pmcMarginBps: 1200 };
    const user = userEvent.setup(); renderWorkspace();
    await openMode(user, "Premium Mode");
    const returnControl = action === "parent tab" ? screen.getByRole("tab", { name: "Mode" })
      : action === "mobile action" ? screen.getByRole("button", { name: "Return to Mode" })
      : screen.getByRole("radio", { name: "Premium Mode" });
    expect(screen.getByRole("button", { name: "Return to Mode" })).toHaveTextContent("Mode");
    if (action === "selected radio Space") { returnControl.focus(); await user.keyboard(" "); }
    else await user.click(returnControl);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Premium Mode" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(within(screen.getByRole("radiogroup", { name: "Mode selection" })).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to Mode" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeDisabled();
    await within(screen.getByRole("tabpanel", { name: "Mode" })).findByRole("checkbox", { name: "PMC" });
    expect(within(screen.getByRole("tabpanel", { name: "Mode" })).getByRole("textbox", { name: "Description" })).toHaveValue("Independent default settings");
    expect(store.get("line-a")!.advanced.default.modeDescription).toBe("Independent default settings");
    expect(screen.queryByText("premium saved line-a")).not.toBeInTheDocument();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it.each(["parent tab", "mobile action", "selected radio"])("guards a dirty tier return through the %s and preserves edits on cancel", async action => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Pending tier return", false);
    const returnControl = action === "parent tab" ? screen.getByRole("tab", { name: "Mode" })
      : action === "mobile action" ? screen.getByRole("button", { name: "Return to Mode" })
      : screen.getByRole("radio", { name: "Premium Mode" });
    await user.click(returnControl);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByDisplayValue("Pending tier return")).toBeVisible();
    await waitFor(() => expect(returnControl).toHaveFocus());
    await user.click(returnControl);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("region", { name: "Premium Mode" })).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(within(screen.getByRole("radiogroup", { name: "Mode selection" })).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it.each(["mobile action", "selected radio"])("retains tier edits after a failed %s return save and applies only that scope on retry", async action => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDefaultMargin(user, panel);
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Mode unavailable"));
    await user.click(action === "mobile action" ? screen.getByRole("button", { name: "Return to Mode" })
      : screen.getByRole("radio", { name: "Premium Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(18);
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Premium Mode" })).not.toBeInTheDocument());
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.pmcMarginBps).toBe(1800);
    expect(store.get("line-a")!.advanced.default).toEqual({});
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls.every(([, , key, input]) => key === "advanced" && input.modeTier === "premium")).toBe(true);
  });

  it("blocks parent, mobile, and selected radio Mode returns while a tier save is in flight", async () => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Premium save in flight", false);
    const save = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (...args) => { await gate; return save(...args); });
    await user.click(within(panel).getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving Premium Mode…" });
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    await user.click(screen.getByRole("button", { name: "Return to Mode" }));
    await user.click(screen.getByRole("radio", { name: "Premium Mode" }));
    await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => finishSave());
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Premium Mode" })).toBeDisabled());
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(screen.queryByRole("region", { name: "Premium Mode" })).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("Premium save in flight");
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
  });

  it("keeps dirty inner mode selected after a failed guard save, then saves that scope before leaving", async () => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDefaultMargin(user, panel);
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Mode unavailable"));
    await user.click(screen.getByRole("radio", { name: "Functional Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(18);
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Functional Mode" })).toBeChecked());
    expect(store.get("line-a")!.advanced.premium.pmcMarginBps).toBe(1800);
    expect(store.get("line-a")!.advanced.functional.modeDescription).toBe("functional saved line-a");
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls.every(([, , key, input]) => key === "advanced" && input.modeTier === "premium")).toBe(true);
  });

  it("preserves a dirty Default editor when a remote Overview toggles tiers off and on", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Mode");
    await setDefaultMargin(user, panel);
    for (const tiers of [[], ["signature", "premium", "functional"]]) {
      store.get("line-a")!.overview = { uomId: "sqft", applicableTiers: tiers };
      await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), section("line-a", "draft-line-a", "overview")); });
      expect(within(panel).getByRole("spinbutton", { name: "Max. PMC Margin (%)" })).toHaveValue(18);
      expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
      await waitFor(() => expect(Boolean(screen.queryByRole("radiogroup", { name: "Mode selection" }))).toBe(tiers.length > 0));
      expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    }
    await user.click(screen.getByRole("button", { name: "Save Mode" }));
    await waitFor(() => expect(store.get("line-a")!.advanced.default.pmcMarginBps).toBe(1800));
    expect(store.get("line-a")!.advanced.default.modeDescription).toBeUndefined();
    expect(store.get("line-a")!.advanced.signature.modeDescription).toBe("signature saved line-a");
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier).toBe("default");
  });

  it("retains a saving tier through remote applicability changes and returns to default only after completion", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Saved Premium while hidden", false);
    const save = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (...args) => { await gate; return save(...args); });
    await user.click(within(panel).getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Saving Premium Mode…" });
    store.get("line-a")!.overview = { uomId: "sqft", applicableTiers: [] };
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), section("line-a", "draft-line-a", "overview")); });
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByDisplayValue("Saved Premium while hidden")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => finishSave());
    await waitFor(() => expect(screen.queryByRole("radiogroup", { name: "Mode selection" })).not.toBeInTheDocument());
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("Saved Premium while hidden");
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier).toBe("premium");
  });

  it("never opens a removed destination tier after an asynchronous guard save completes", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const premium = await openMode(user, "Premium Mode");
    await setDefaultMargin(user, premium);
    const save = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (...args) => { await gate; return save(...args); });
    await user.click(screen.getByRole("radio", { name: "Functional Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(1));
    vi.mocked(api.getKnowledgeSection).mockClear();
    store.get("line-a")!.overview = { uomId: "sqft", applicableTiers: ["signature", "premium"] };
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), section("line-a", "draft-line-a", "overview")); });
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Functional Mode" })).not.toBeInTheDocument());
    await act(async () => finishSave());
    await waitFor(() => expect(screen.getByRole("tab", { name: "Mode" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.pmcMarginBps).toBe(1800);
    expect(store.get("line-a")!.advanced.functional.modeDescription).toBe("functional saved line-a");
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier).toBe("premium");
    expect(vi.mocked(api.getKnowledgeSection).mock.calls.some(([, , , options]) => options?.modeTier === "functional")).toBe(false);
  });

  it("preserves read-only permissions and does not render edits in any mode", async () => {
    store.get("line-a")!.advanced.default = { modeDescription: "Read-only common description" };
    permissions.editable = false;
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole("tab", { name: "Mode" });
    for (const label of ["Mode", "Signature Mode", "Premium Mode", "Functional Mode"]) {
      const panel = await selectMode(user, label);
      await within(panel).findByRole("checkbox", { name: "PMC" });
      expect(within(panel).queryByRole("button", { name: "Edit Description" })).not.toBeInTheDocument();
      expect(within(panel).getByRole("textbox", { name: "Description" })).toHaveAttribute("readonly");
      expect(within(panel).getByRole("textbox", { name: "Description" })).toHaveValue(label === "Mode"
        ? "Read-only common description" : `${label.split(" ")[0]!.toLowerCase()} saved line-a`);
      expect(within(panel).getByRole("button", { name: "Save" })).toBeDisabled();
      expect(within(panel).getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: `Save ${label}` })).not.toBeInTheDocument();
    }
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("keeps missing default settings separate during loading, failure, and retry", async () => {
    const user = userEvent.setup(); let release!: () => void; let unavailable = true;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const read = vi.mocked(api.getKnowledgeSection).getMockImplementation()!;
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (id, revisionId, key, options) => {
      if (key === "advanced" && options?.modeTier === "default" && unavailable) { await gate; throw new Error("Default read unavailable"); }
      return read(id, revisionId, key, options);
    });
    renderWorkspace();
    await user.click(await screen.findByRole("tab", { name: "Mode" }));
    const panel = screen.getByRole("tabpanel", { name: "Mode" });
    expect(await within(panel).findByText("Loading Mode configuration…")).toBeVisible();
    expect(within(panel).queryByText("signature saved line-a")).not.toBeInTheDocument();
    await act(async () => release());
    const retry = await within(panel).findByRole("button", { name: "Retry Mode configuration" });
    expect(within(panel).getByText("Mode configuration: Default read unavailable")).toBeVisible();
    expect(within(panel).queryByText("signature saved line-a")).not.toBeInTheDocument();
    unavailable = false; await user.click(retry);
    await within(panel).findByRole("checkbox", { name: "PMC" });
    expect(within(panel).getByRole("textbox", { name: "Description" })).toHaveValue("");
    expect(within(panel).queryByText("signature saved line-a")).not.toBeInTheDocument();
    const signature = await openMode(user, "Signature Mode");
    expect(await within(signature).findByRole("textbox", { name: "Description" })).toHaveValue("signature saved line-a");
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });
});
