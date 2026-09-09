import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, StrictMode, type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeModePanel, type KnowledgeModePanelHandle } from "./KnowledgeModePanel";
import * as api from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgePendingChangesSnapshot } from "./knowledgePendingChanges";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeSectionEnvelope, KnowledgeSectionKey } from "./knowledgeTypes";

vi.mock("./knowledgeApi", async (original) => ({ ...await original<typeof import("./knowledgeApi")>(), getKnowledgeSection: vi.fn(), getKnowledgeItem: vi.fn(), updateKnowledgeSection: vi.fn() }));
const metadata = { createdById: "actor", updatedById: "actor", createdAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z" };
const item: KnowledgeItemDetail = { id: "item-1", mainLineId: "item-1", mainLineName: "Gypsum ceiling", basketId: "basket-1", basketName: "POP / Gypsum", description: null, status: "draft", activeRevisionId: null, draftRevisionId: "revision-1", revisionNumber: 1, uomId: null, priorityId: null, modeIds: [], surfaceIds: [], vendorIds: [], completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, allowedActions: ["update_section"], activeRevision: null, draftRevision: null, blockers: [], warnings: [], version: 10, ...metadata };
const savedPricing: KnowledgeJsonObject = { specifications: [{ id: "spec-1", name: "Saved board", description: "Saved specification detail" }] };
function section(key: KnowledgeSectionKey, payload: KnowledgeJsonObject, version = 1, revisionId = "revision-1"): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return { id: `section-${key}`, mainLineId: item.mainLineId, revisionId, sectionKey: key, applicability: "configured", payload, version, ...metadata };
}
function setup(overrides: Partial<ComponentProps<typeof KnowledgeModePanel>> = {}, strict = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const ref = createRef<KnowledgeModePanelHandle>();
  const onPendingChanges = vi.fn<(snapshot: KnowledgePendingChangesSnapshot) => void>();
  const props: ComponentProps<typeof KnowledgeModePanel> = { item, revisionId: "revision-1", masters: {}, relationshipBaskets: [], relationshipItems: [], editable: true, legacyModeCatalogState: { status: "ready" }, onDirtyChange: vi.fn(), onSavingChange: vi.fn(), onBusyChange: vi.fn(), onAnnouncement: vi.fn(), pendingChangesSourceKey: "session-1", onPendingChanges, ...overrides };
  const view = (next: typeof props) => <QueryClientProvider client={queryClient}>{strict ? <StrictMode><KnowledgeModePanel {...next} ref={ref} /></StrictMode> : <KnowledgeModePanel {...next} ref={ref} />}</QueryClientProvider>;
  const rendered = render(view(props));
  return { ...rendered, queryClient, ref, onPendingChanges, latest: () => onPendingChanges.mock.lastCall?.[0], rerenderProps: (next: Partial<typeof props>) => rendered.rerender(view({ ...props, ...next })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getKnowledgeItem).mockResolvedValue(item);
  vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, revision, key) => section(key, key === "pricing" ? savedPricing : {}, 1, revision));
  vi.mocked(api.updateKnowledgeSection).mockImplementation(async (_id, revision, key, input) => ({ ...section(key, input.payload, input.expectedVersion + 1, revision), aggregateVersion: 11 }));
});

describe("Mode pending publication lifecycle", () => {
  it("does not publish saved/default content or viewing selections; local edit/revert is exact", async () => {
    const user = userEvent.setup();
    const panel = setup();
    await screen.findByRole("textbox", { name: "Specification name" });
    expect(panel.latest()?.groups).toEqual([]);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    expect(panel.latest()?.groups).toEqual([]);
    const description = screen.getByRole("textbox", { name: "Brief description" });
    fireEvent.change(description, { target: { value: "Only local requirement" } });
    expect(panel.latest()?.groups[0]?.entries[0]?.fields).toEqual([{ key: "description", label: "Description", value: "Only local requirement" }]);
    expect(JSON.stringify(panel.latest())).not.toContain("Saved specification detail");
    fireEvent.change(description, { target: { value: "Saved specification detail" } });
    expect(panel.latest()?.groups).toEqual([]);
  });

  it("keeps the frozen draft baseline through refetch and conflict keep-editing", async () => {
    const user = userEvent.setup();
    const panel = setup();
    const description = await screen.findByRole("textbox", { name: "Brief description" });
    fireEvent.change(description, { target: { value: "Local specification" } });
    act(() => panel.queryClient.setQueryData(knowledgeQueryKeys.section(item.mainLineId, "revision-1", "pricing"), section("pricing", { specifications: [{ id: "spec-1", name: "Remote board", description: "Remote specification" }] }, 2)));
    expect(panel.latest()?.groups[0]?.entries[0]).toMatchObject({ title: "Saved board", fields: [{ value: "Local specification" }] });
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Updated elsewhere."));
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, revision, key) => section(key, key === "pricing" ? { specifications: [{ id: "spec-1", name: "Remote board", description: "Remote specification" }] } : { pmcMarginBps: 1_800 }, 3, revision));
    await act(async () => { expect(await panel.ref.current?.save()).toBe(false); });
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Keep editing" }));
    expect(panel.latest()?.groups[0]?.entries[0]).toMatchObject({ title: "Saved board", fields: [{ value: "Local specification" }] });
    expect(JSON.stringify(panel.latest())).not.toContain("Remote");
    act(() => panel.ref.current?.discard());
    expect(panel.latest()?.groups).toEqual([]);
  });


  it("excludes accepted server calculation fields when their source is first edited after a conflict", async () => {
    const user = userEvent.setup();
    const panel = setup();
    await screen.findByRole("textbox", { name: "Brief description" });
    fireEvent.change(screen.getByRole("spinbutton", { name: "PMC Margin" }), { target: { value: "15" } });
    const remoteCalculation = { baseRatePaise: 30_000, lowQuantityLimit: "82", impactBps: 1_600, minimumMarkupBps: 2_700, startingMarkupBps: 3_900 };
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Updated elsewhere."));
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, revision, key) => section(key, key === "advanced" ? { modeCalculations: { pmc: null, sub_vendor: remoteCalculation, in_house_labor: null, in_house_material: null }, pmcMarginBps: 1_900 } : savedPricing, 2, revision));
    await act(async () => { expect(await panel.ref.current?.save()).toBe(false); });
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Keep editing" }));
    expect(panel.latest()?.groups.map((group) => group.key)).toEqual(["pmc:margin"]);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    const source = screen.getByRole("region", { name: "Sub-Vendor calculations" });
    fireEvent.change(within(source).getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "34x" } });
    expect(panel.latest()?.groups.find((group) => group.key === "calculation:sub_vendor")?.entries[0]).toMatchObject({ incomplete: true, fields: [{ key: "baseRate", label: "Base Rate (₹)", value: "34x" }] });
    expect(panel.latest()?.groups.find((group) => group.key === "calculation:sub_vendor")?.entries[0]?.fields).toHaveLength(1);
    fireEvent.change(within(source).getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "340" } });
    expect(panel.latest()?.groups.find((group) => group.key === "calculation:sub_vendor")?.entries[0]?.fields).toEqual([{ key: "baseRate", label: "Base Rate (₹)", value: "340" }]);
    expect(JSON.stringify(panel.latest())).not.toContain("82");
  });

  it("clears only the confirmed advanced block on partial save and retains failed Specifications", async () => {
    const panel = setup();
    const description = await screen.findByRole("textbox", { name: "Brief description" });
    fireEvent.change(description, { target: { value: "Unconfirmed specification" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "PMC Margin" }), { target: { value: "15" } });
    expect(panel.latest()?.groups.map((group) => group.key)).toEqual(["pmc:margin", "specifications"]);
    vi.mocked(api.updateKnowledgeSection).mockImplementation(async (_id, revision, key, input) => {
      if (key === "pricing") throw new Error("Connection interrupted");
      return { ...section(key, input.payload, input.expectedVersion + 1, revision), aggregateVersion: 11 };
    });
    await act(async () => { expect(await panel.ref.current?.save()).toBe(false); });
    expect(panel.latest()?.groups.map((group) => group.key)).toEqual(["specifications"]);
    expect(panel.latest()?.groups[0]?.entries[0]?.fields[0]?.value).toBe("Unconfirmed specification");
    expect(api.updateKnowledgeSection).toHaveBeenCalledTimes(2);
  });


  it("clears advanced raw inputs on conflict discard when the server already matches them, retaining unsaved Specifications", async () => {
    const user = userEvent.setup();
    const calculation = { baseRatePaise: 10_000, lowQuantityLimit: "15", impactBps: 1_000, minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    const advanced = (baseRatePaise: number): KnowledgeJsonObject => ({ modeCalculations: {
      pmc: { ...calculation, baseRatePaise }, sub_vendor: null, in_house_labor: null, in_house_material: null
    } });
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, revision, key) => section(key, key === "advanced" ? advanced(10_000) : key === "pricing" ? savedPricing : {}, 1, revision));
    const panel = setup();
    const rate = await screen.findByRole("textbox", { name: "Base Rate (₹)" });
    await waitFor(() => expect(rate).toHaveValue("100.00"));
    fireEvent.change(rate, { target: { value: "120" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Brief description" }), { target: { value: "Still unsaved specification" } });
    expect(panel.latest()?.groups.map((group) => group.key)).toEqual(["calculation:pmc", "specifications"]);
    vi.mocked(api.updateKnowledgeSection).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Updated elsewhere."));
    vi.mocked(api.getKnowledgeSection).mockImplementation(async (_id, revision, key) => section(key, key === "advanced" ? advanced(12_000) : key === "pricing" ? savedPricing : {}, 2, revision));
    await act(async () => { expect(await panel.ref.current?.save()).toBe(false); });
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard local changes" }));
    expect(panel.latest()?.groups.map((group) => group.key)).toEqual(["specifications"]);
    expect(panel.latest()?.groups[0]?.entries[0]?.fields[0]?.value).toBe("Still unsaved specification");
    expect(screen.getByRole("textbox", { name: "Base Rate (₹)" })).toHaveValue("120.00");
    fireEvent.change(screen.getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "130" } });
    expect(panel.latest()?.groups.find((group) => group.key === "calculation:pmc")?.entries[0]?.fields).toEqual([{ key: "baseRate", label: "Base Rate (₹)", value: "130" }]);
    fireEvent.change(screen.getByRole("textbox", { name: "Base Rate (₹)" }), { target: { value: "120" } });
    expect(panel.latest()?.groups.map((group) => group.key)).toEqual(["specifications"]);
  });

  it("publishes unapplied paragraph text, cancels it, and keeps applied text until section save", async () => {
    const user = userEvent.setup();
    const panel = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Mode paragraph" }));
    const paragraph = screen.getByRole("textbox", { name: "Mode paragraph" });
    fireEvent.change(paragraph, { target: { value: "Pending ceiling requirement." } });
    expect(panel.latest()?.groups[0]?.entries[0]?.fields[0]?.value).toBe("Pending ceiling requirement.");
    await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(panel.latest()?.groups).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Mode paragraph" }), { target: { value: "Applied ceiling requirement." } });
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(panel.latest()?.groups[0]?.entries[0]?.fields[0]?.value).toBe("Applied ceiling requirement.");
    await act(async () => { expect(await panel.ref.current?.save()).toBe(true); });
    expect(panel.latest()?.groups).toEqual([]);
  });

  it("freezes the paragraph baseline while its local editor has not applied and a refetch arrives", async () => {
    const user = userEvent.setup();
    const panel = setup();
    await user.click(await screen.findByRole("button", { name: "Edit Mode paragraph" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Mode paragraph" }), { target: { value: "Unapplied local wording." } });
    act(() => panel.queryClient.setQueryData(knowledgeQueryKeys.section(item.mainLineId, "revision-1", "advanced"), section("advanced", { modeDescription: "Remote saved wording.", pmcMarginBps: 1_900 }, 2)));
    expect(panel.latest()?.groups).toHaveLength(1);
    expect(JSON.stringify(panel.latest())).not.toContain("Remote");
    await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(panel.latest()?.groups).toEqual([]);
  });

  it("publishes raw incomplete calculations without the last valid number and clears on discard", async () => {
    const panel = setup();
    const baseRate = await screen.findByRole("textbox", { name: "Base Rate (₹)" });
    fireEvent.change(baseRate, { target: { value: "120" } });
    expect(panel.latest()?.groups[0]?.entries[0]?.fields).toEqual([{ key: "baseRate", label: "Base Rate (₹)", value: "120" }]);
    fireEvent.change(baseRate, { target: { value: "12x" } });
    expect(panel.latest()?.groups[0]?.entries[0]).toMatchObject({ incomplete: true, fields: [{ value: "12x" }] });
    await act(async () => { expect(await panel.ref.current?.save()).toBe(false); });
    expect(panel.latest()?.groups[0]?.entries[0]?.fields[0]?.value).toBe("12x");
    act(() => panel.ref.current?.discard());
    expect(panel.latest()?.groups).toEqual([]);
  });

  it("emits empty source cleanup under StrictMode and never republishes old data under a new source", async () => {
    const panel = setup({}, true);
    const description = await screen.findByRole("textbox", { name: "Brief description" });
    fireEvent.change(description, { target: { value: "First session only" } });
    expect(panel.latest()?.groups).toHaveLength(1);
    panel.onPendingChanges.mockClear();
    panel.rerenderProps({ pendingChangesSourceKey: "session-2", revisionId: "revision-2" });
    await waitFor(() => expect(panel.latest()).toEqual({ sourceKey: "session-2", groups: [] }));
    expect(panel.onPendingChanges.mock.calls.filter(([snapshot]) => snapshot.sourceKey === "session-2").every(([snapshot]) => snapshot.groups.length === 0)).toBe(true);
    expect(panel.onPendingChanges).toHaveBeenCalledWith({ sourceKey: "session-1", groups: [] });
    panel.unmount();
    expect(panel.latest()).toEqual({ sourceKey: "session-2", groups: [] });
  });


  it("does not publish a late save response from a departed source into the new session", async () => {
    const panel = setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "Brief description" }), { target: { value: "Departed local specification" } });
    let finish!: (response: Awaited<ReturnType<typeof api.updateKnowledgeSection>>) => void;
    vi.mocked(api.updateKnowledgeSection).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    let saving!: Promise<boolean>;
    act(() => { saving = panel.ref.current!.save(); });
    panel.rerenderProps({ revisionId: "revision-2", pendingChangesSourceKey: "session-2" });
    await waitFor(() => expect(panel.latest()).toEqual({ sourceKey: "session-2", groups: [] }));
    await act(async () => {
      finish({ ...section("pricing", { specifications: [{ id: "spec-1", name: "Saved board", description: "Departed local specification" }] }, 2), aggregateVersion: 11 });
      await saving;
    });
    expect(panel.latest()).toEqual({ sourceKey: "session-2", groups: [] });
    expect(screen.getByRole("textbox", { name: "Brief description" })).toHaveValue("Saved specification detail");
  });

  it("publishes nothing when the same dirty editor becomes read-only", async () => {
    const panel = setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "Brief description" }), { target: { value: "Local requirement" } });
    expect(panel.latest()?.groups).toHaveLength(1);
    panel.rerenderProps({ editable: false });
    expect(panel.latest()?.groups).toEqual([]);
  });
});
