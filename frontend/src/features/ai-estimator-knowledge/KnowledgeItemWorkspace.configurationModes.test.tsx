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
  getKnowledgeItem: vi.fn(), getKnowledgeHistory: vi.fn(), getKnowledgeSection: vi.fn(), updateKnowledgeSection: vi.fn(),
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
function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: 0 }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/configuration/line-a"]}>
    <Link to="/configuration/line-a">Open first line</Link><Link to="/configuration/line-b">Open other line</Link>
    <Routes><Route path="/configuration/:itemId" element={<main><KnowledgeItemWorkspacePage /></main>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return { ...result, client };
}
const modeTabs = () => within(screen.getByRole("tablist", { name: "Configuration sections" })).getAllByRole("tab").map(tab => tab.textContent);
async function openMode(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByRole("tab", { name: label }));
  const panel = screen.getByRole("tabpanel", { name: label });
  await within(panel).findByRole("button", { name: "Edit Description" });
  return panel;
}
async function setDescription(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, value: string) {
  await user.click(within(panel).getByRole("button", { name: "Edit Description" }));
  const input = within(panel).getByRole("textbox", { name: "Description" });
  await user.clear(input); await user.type(input, value);
  await user.click(within(panel).getByRole("button", { name: "Save" }));
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
  it("shows all four modes only from saved Overview, including the mobile selector", async () => {
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole("checkbox", { name: "Signature" });
    expect(modeTabs().slice(0, 5)).toEqual(["Overview", "Mode", "Signature Mode", "Premium Mode", "Functional Mode"]);
    const selector = screen.getByRole("combobox", { name: "Configuration section" });
    expect(within(selector).getAllByRole("option").slice(0, 5).map(option => option.textContent)).toEqual(modeTabs().slice(0, 5));
    await user.click(screen.getByRole("checkbox", { name: "Signature" }));
    expect(screen.getByRole("tab", { name: "Signature Mode" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Signature Mode" })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Mode" })).toBeVisible();
    expect(store.get("line-a")!.advanced.signature.modeDescription).toBe("signature saved line-a");
    await user.click(screen.getByRole("checkbox", { name: "Signature" }));
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await screen.findByRole("tab", { name: "Signature Mode" });
    await user.selectOptions(selector, "signature-mode");
    expect(await within(screen.getByRole("tabpanel", { name: "Signature Mode" })).findByText("signature saved line-a")).toBeVisible();
  });

  it("keeps saved tabs when Overview save fails, and retains default with no applicable tiers", async () => {
    const user = userEvent.setup(); renderWorkspace();
    await user.click(await screen.findByRole("checkbox", { name: "Signature" }));
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Overview unavailable"));
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    expect(await screen.findByText("Overview unavailable")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Signature Mode" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Premium" }));
    await user.click(screen.getByRole("checkbox", { name: "Functional" }));
    await user.click(screen.getByRole("button", { name: "Save Overview" }));
    await waitFor(() => expect(modeTabs().slice(0, 3)).toEqual(["Overview", "Mode", "Recommendation & Exclusions"]));
    expect(store.get("line-a")!.overview.applicableTiers).toEqual([]);
  });

  it("saves unequal descriptions in each scope and reloads them without cross-mode or cross-line changes", async () => {
    const user = userEvent.setup(); let view = renderWorkspace();
    const labels = ["Mode", "Signature Mode", "Premium Mode", "Functional Mode"];
    const untouchedOther = structuredClone(store.get("line-b")!);
    for (const [index, label] of labels.entries()) {
      const panel = await openMode(user, label);
      if (label === "Mode") expect(within(panel).queryByText("signature saved line-a")).not.toBeInTheDocument();
      await setDescription(user, panel, `Distinct ${label} configuration ${index}`);
      await user.click(screen.getByRole("button", { name: `Save ${label}` }));
      await waitFor(() => expect(screen.getByRole("button", { name: `Save ${label}` })).toBeDisabled());
      expect(store.get("line-a")!.advanced[KNOWLEDGE_MODE_CONFIGURATION_SCOPES[index]!].modeDescription).toBe(`Distinct ${label} configuration ${index}`);
    }
    expect(store.get("line-b")).toEqual(untouchedOther);
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls.map(([, , key, input]) => [key, input.modeTier ?? "signature"]))
      .toEqual(KNOWLEDGE_MODE_CONFIGURATION_SCOPES.map(scope => ["advanced", scope]));
    view.unmount(); view.client.clear(); view = renderWorkspace();
    for (const [index, label] of labels.entries()) {
      const panel = await openMode(user, label);
      expect(await within(panel).findByText(`Distinct ${label} configuration ${index}`)).toBeVisible();
    }
    await user.click(screen.getByRole("link", { name: "Open other line" }));
    await screen.findByRole("heading", { level: 1, name: "Wall B" });
    const otherPanel = await openMode(user, "Mode");
    expect(await within(otherPanel).findByText("default saved line-b")).toBeVisible();
    expect(within(otherPanel).queryByText(/Distinct/)).not.toBeInTheDocument();
    expect(store.get("line-b")).toEqual(untouchedOther);
  });

  it("guards unsaved default edits and does not close a dirty Signature tab when applicability changes", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Mode");
    await setDescription(user, panel, "Unsaved default description");
    await user.click(screen.getByRole("tab", { name: "Signature Mode" }));
    const dialog = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(dialog).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Signature Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    const signature = screen.getByRole("tabpanel", { name: "Signature Mode" });
    await within(signature).findByText("signature saved line-a");
    await setDescription(user, signature, "Unsaved Signature description");
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), {
      ...section("line-a", "draft-line-a", "overview"), payload: { uomId: "sqft", applicableTiers: [] }
    }); });
    expect(screen.getByRole("tab", { name: "Signature Mode" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Unsaved Signature description")).toBeVisible();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("returns a hidden clean Signature tab to Overview and uses accessible keyboard order", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const overview = await screen.findByRole("tab", { name: "Overview" }); overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Signature Mode" })).toHaveFocus();
    await within(screen.getByRole("tabpanel", { name: "Signature Mode" })).findByText("signature saved line-a");
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), {
      ...section("line-a", "draft-line-a", "overview"), payload: { uomId: "sqft", applicableTiers: [] }
    }); });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.queryByRole("tab", { name: "Signature Mode" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mode" })).toBeVisible();
  });

  it("preserves read-only permissions and does not render edits in any mode", async () => {
    permissions.editable = false;
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole("tab", { name: "Mode" });
    for (const label of ["Mode", "Signature Mode", "Premium Mode", "Functional Mode"]) {
      await user.click(screen.getByRole("tab", { name: label }));
      const panel = screen.getByRole("tabpanel", { name: label });
      await waitFor(() => expect(api.getKnowledgeSection).toHaveBeenCalled());
      expect(within(panel).queryByRole("button", { name: "Edit Description" })).not.toBeInTheDocument();
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
    await within(panel).findByRole("button", { name: "Edit Description" });
    expect(within(panel).queryByText("signature saved line-a")).not.toBeInTheDocument();
    const signature = await openMode(user, "Signature Mode");
    expect(await within(signature).findByText("signature saved line-a")).toBeVisible();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });
});
