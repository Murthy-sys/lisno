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
    expect(await within(screen.getByRole("region", { name: "Signature Mode" })).findByText("signature saved line-a")).toBeVisible();
    expect(within(inner).getAllByRole("radio", { checked: true })).toEqual([radios[0]]);
    await user.click(within(inner).getByRole("radio", { name: "Premium Mode" }));
    expect(await within(screen.getByRole("region", { name: "Premium Mode" })).findByText("premium saved line-a")).toBeVisible();
    expect(within(inner).getAllByRole("radio", { checked: true })).toEqual([radios[1]]);
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
    expect(await within(signature).findByText("signature saved line-a")).toBeVisible();
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

  it("guards unsaved default edits and does not close a dirty Signature mode when applicability changes", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Mode");
    await setDescription(user, panel, "Unsaved default description");
    await user.click(screen.getByRole("radio", { name: "Signature Mode" }));
    const dialog = screen.getByRole("alertdialog", { name: "Save changes before leaving?" });
    await user.click(within(dialog).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Signature Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    const signature = screen.getByRole("region", { name: "Signature Mode" });
    await within(signature).findByText("signature saved line-a");
    await setDescription(user, signature, "Unsaved Signature description");
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), {
      ...section("line-a", "draft-line-a", "overview"), payload: { uomId: "sqft", applicableTiers: [] }
    }); });
    expect(screen.getByRole("radio", { name: "Signature Mode" })).toBeChecked();
    expect(screen.getByText("Unsaved Signature description")).toBeVisible();
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
    await within(screen.getByRole("region", { name: "Signature Mode" })).findByText("signature saved line-a");
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
    await setDescription(user, panel, "Pending default description");
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Pending default description")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
    expect(within(screen.getByRole("radiogroup", { name: "Mode selection" })).getAllByRole("radio").every(radio => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Premium Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard changes" }));
    const premium = screen.getByRole("region", { name: "Premium Mode" });
    await within(premium).findByText("premium saved line-a");
    await setDescription(user, premium, "Pending Premium description");
    await act(async () => { await view.client.invalidateQueries({ queryKey: knowledgeQueryKeys.section("line-a", "draft-line-a", "overview") }); });
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByText("Pending Premium description")).toBeVisible();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it("preserves the selected radio and focus when a keyboard change is cancelled or blocked by a save", async () => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Premium radio guard draft");
    const group = screen.getByRole("radiogroup", { name: "Mode selection" });
    const premium = within(group).getByRole("radio", { name: "Premium Mode" });
    const functional = within(group).getByRole("radio", { name: "Functional Mode" });
    premium.focus(); await user.keyboard("{ArrowDown}");
    expect(within(group).getAllByRole("radio", { checked: true })).toEqual([premium]);
    expect(functional).not.toBeChecked();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay here" }));
    await waitFor(() => expect(premium).toHaveFocus());
    expect(screen.getByText("Premium radio guard draft")).toBeVisible();
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
    expect(await within(screen.getByRole("region", { name: "Functional Mode" })).findByText("functional saved line-a")).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("Premium radio guard draft");
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
    await waitFor(() => expect(within(screen.getByRole("tabpanel", { name: "Mode" })).getByText("Independent default settings")).toBeVisible());
    expect(screen.queryByText("premium saved line-a")).not.toBeInTheDocument();
    expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
  });

  it.each(["parent tab", "mobile action", "selected radio"])("guards a dirty tier return through the %s and preserves edits on cancel", async action => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Pending tier return");
    const returnControl = action === "parent tab" ? screen.getByRole("tab", { name: "Mode" })
      : action === "mobile action" ? screen.getByRole("button", { name: "Return to Mode" })
      : screen.getByRole("radio", { name: "Premium Mode" });
    await user.click(returnControl);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByText("Pending tier return")).toBeVisible();
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
    await setDescription(user, panel, "Premium saved before returning to Mode");
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Mode unavailable"));
    await user.click(action === "mobile action" ? screen.getByRole("button", { name: "Return to Mode" })
      : screen.getByRole("radio", { name: "Premium Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByText("Premium saved before returning to Mode")).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Premium Mode" })).not.toBeInTheDocument());
    expect(screen.getByRole("tabpanel", { name: "Mode" })).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("Premium saved before returning to Mode");
    expect(store.get("line-a")!.advanced.default).toEqual({});
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls.every(([, , key, input]) => key === "advanced" && input.modeTier === "premium")).toBe(true);
  });

  it("blocks parent, mobile, and selected radio Mode returns while a tier save is in flight", async () => {
    const user = userEvent.setup(); renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Premium save in flight");
    const save = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (...args) => { await gate; return save(...args); });
    await user.click(screen.getByRole("button", { name: "Save Premium Mode" }));
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
    await setDescription(user, panel, "Pending Premium description");
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new Error("Mode unavailable"));
    await user.click(screen.getByRole("radio", { name: "Functional Mode" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByText("Pending Premium description")).toBeVisible();
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("premium saved line-a");
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Functional Mode" })).toBeChecked());
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("Pending Premium description");
    expect(store.get("line-a")!.advanced.functional.modeDescription).toBe("functional saved line-a");
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls.every(([, , key, input]) => key === "advanced" && input.modeTier === "premium")).toBe(true);
  });

  it("preserves a dirty Default editor when a remote Overview toggles tiers off and on", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Mode");
    await setDescription(user, panel, "Default draft survives selector changes");
    for (const tiers of [[], ["signature", "premium", "functional"]]) {
      store.get("line-a")!.overview = { uomId: "sqft", applicableTiers: tiers };
      await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), section("line-a", "draft-line-a", "overview")); });
      expect(screen.getByText("Default draft survives selector changes")).toBeVisible();
      expect(screen.getByRole("button", { name: "Save Mode" })).toBeEnabled();
      await waitFor(() => expect(Boolean(screen.queryByRole("radiogroup", { name: "Mode selection" }))).toBe(tiers.length > 0));
      expect(api.updateKnowledgeSection).not.toHaveBeenCalled();
    }
    await user.click(screen.getByRole("button", { name: "Save Mode" }));
    await waitFor(() => expect(store.get("line-a")!.advanced.default.modeDescription).toBe("Default draft survives selector changes"));
    expect(store.get("line-a")!.advanced.signature.modeDescription).toBe("signature saved line-a");
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier).toBe("default");
  });

  it("retains a saving tier through remote applicability changes and returns to default only after completion", async () => {
    const user = userEvent.setup(); const view = renderWorkspace();
    const panel = await openMode(user, "Premium Mode");
    await setDescription(user, panel, "Saved Premium while hidden");
    const save = vi.mocked(api.updateKnowledgeSection).getMockImplementation()!;
    let finishSave!: () => void;
    const gate = new Promise<void>(resolve => { finishSave = resolve; });
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (...args) => { await gate; return save(...args); });
    await user.click(screen.getByRole("button", { name: "Save Premium Mode" }));
    await screen.findByRole("button", { name: "Saving Premium Mode…" });
    store.get("line-a")!.overview = { uomId: "sqft", applicableTiers: [] };
    await act(async () => { view.client.setQueryData(knowledgeQueryKeys.section("line-a", "draft-line-a", "overview"), section("line-a", "draft-line-a", "overview")); });
    expect(screen.getByRole("radio", { name: "Premium Mode" })).toBeChecked();
    expect(screen.getByText("Saved Premium while hidden")).toBeVisible();
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
    await setDescription(user, premium, "Premium saved before guarded transition");
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
    expect(store.get("line-a")!.advanced.premium.modeDescription).toBe("Premium saved before guarded transition");
    expect(store.get("line-a")!.advanced.functional.modeDescription).toBe("functional saved line-a");
    expect(vi.mocked(api.updateKnowledgeSection).mock.calls[0]![3].modeTier).toBe("premium");
    expect(vi.mocked(api.getKnowledgeSection).mock.calls.some(([, , , options]) => options?.modeTier === "functional")).toBe(false);
  });

  it("preserves read-only permissions and does not render edits in any mode", async () => {
    permissions.editable = false;
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole("tab", { name: "Mode" });
    for (const label of ["Mode", "Signature Mode", "Premium Mode", "Functional Mode"]) {
      const panel = await selectMode(user, label);
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
