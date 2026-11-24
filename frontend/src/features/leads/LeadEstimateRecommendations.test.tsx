import { selectPickerLine } from "./salesItemPicker.test-fixture";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
const authState = vi.hoisted(() => ({ role: undefined as string | undefined }));
const builderActions = vi.hoisted(() => ({ select: undefined as ComponentProps<typeof import("./ConfiguredEstimateBuilder").ConfiguredEstimateBuilder>["onSelectRecommendedLine"] }));
vi.mock("./ConfiguredEstimateBuilder", async importOriginal => {
  const actual = await importOriginal<typeof import("./ConfiguredEstimateBuilder")>();
  return { ...actual, ConfiguredEstimateBuilder: (props: ComponentProps<typeof actual.ConfiguredEstimateBuilder>) => {
    builderActions.select = props.onSelectRecommendedLine;
    return <actual.ConfiguredEstimateBuilder {...props} />;
  } };
});
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "test-estimator", role: authState.role }, reviewSession: { id: "test-session" }, status: "authenticated" }) }));
beforeEach(() => { authState.role = undefined; });
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));


import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import type { EstimationCatalogue, EstimationRecommendationRule } from "./estimationCatalogueApi";

const response = (data: unknown) => Response.json({ data });
const uom = { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 };
const catalogue = { items: [
  { id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [], subBaskets: [{ id: "sub-ceiling", basketId: "basket-pop", name: "False Ceiling", displayOrder: 1, mainLines: [
    { id: "line-pop", showByDefault: true, mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "POP false ceiling", displayOrder: 1, revisionId: "rev-pop", revisionVersion: 2, itemVersion: 3, inHouseBaseRatePaise: 10_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 10_000, in_house: 10_000 }, uom },
    { id: "line-functional", showByDefault: true, mainLineId: "line-functional", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "Functional Lights", displayOrder: 2, revisionId: "rev-functional", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 15_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 15_000, in_house: 15_000 }, uom }
  ] }] },
  { id: "basket-paint", name: "Painting", displayOrder: 2, directTemporaryItems: [], subBaskets: [{ id: "sub-paint", basketId: "basket-paint", name: "Ceiling finish", displayOrder: 1, mainLines: [
    { id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint", name: "False ceiling painting", displayOrder: 1, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 25_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 25_000, in_house: 25_000 }, uom },
    { id: "line-primer", showByDefault: true, mainLineId: "line-primer", basketId: "basket-paint", subBasketId: "sub-paint", name: "Ceiling primer", displayOrder: 2, revisionId: "rev-primer", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 12_000, modeBaseRatesPaise: { pmc: 5_000, sub_vendor: 12_000, in_house: 12_000 }, uom },
    { id: "line-coating", showByDefault: true, mainLineId: "line-coating", basketId: "basket-paint", subBasketId: "sub-paint", name: "Protective coating", displayOrder: 3, revisionId: "rev-coating", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 18_000, modeBaseRatesPaise: { pmc: 7_000, sub_vendor: 18_000, in_house: 18_000 }, uom }
  ] }, { id: "sub-wall", basketId: "basket-paint", name: "Wall finish", displayOrder: 2, mainLines: [
    { id: "line-wall", showByDefault: true, mainLineId: "line-wall", basketId: "basket-paint", subBasketId: "sub-wall", name: "Feature wall texture", displayOrder: 1, revisionId: "rev-wall", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 32_000, modeBaseRatesPaise: { pmc: 10_000, sub_vendor: 32_000, in_house: 32_000 }, uom }
  ] }] },
  { id: "basket-light", name: "Lights", displayOrder: 3, directTemporaryItems: [], subBaskets: [{ id: "sub-light", basketId: "basket-light", name: "Integrated lights", displayOrder: 1, mainLines: [
    { id: "line-light", mainLineId: "line-light", basketId: "basket-light", subBasketId: "sub-light", name: "False ceiling functional lights", displayOrder: 1, revisionId: "rev-light", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 35_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 35_000, in_house: 35_000 }, uom }
  ] }] }
], pagination: { limit: 100, offset: 0, total: 3, hasMore: false }, ineligibleLineCount: 0 };
const revisions: Record<string, { revisionId: string; revisionVersion: number; itemVersion: number }> = {
  "line-pop": { revisionId: "rev-pop", revisionVersion: 2, itemVersion: 3 },
  "line-functional": { revisionId: "rev-functional", revisionVersion: 1, itemVersion: 1 },
  "line-paint": { revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1 },
  "line-light": { revisionId: "rev-light", revisionVersion: 1, itemVersion: 1 }
};

function installReads(failFirstRecommendation = false, savedEstimate: unknown = null, recommendationGate?: Promise<void> | ((ids: readonly string[]) => Promise<void> | void), sharedTarget = false, saveGate?: Promise<void>, echoDraftSave = false, rulesForSource?: (sourceId: string) => EstimationRecommendationRule[], readCatalogue: () => unknown = () => catalogue) {
  const calls: string[][] = [];
  const requests: Array<{ url: string; method: string }> = [];
  const savedInputs: Array<{ expectedVersion?: number; rooms: Array<{ id: string; label: string }>; selectedMainBasketIds: string[]; lineItems: Array<{
    source: string; id?: string; roomId: string; roomName: string; mainLineId: string; mainBasketId: string;
    subBasketId: string | null; included: boolean; quantity: number; ratePaise: number | null;
    pricingMode?: string; rateSource?: string;
    recommendationSourceMainLineIds?: string[]
  }> }> = [];
  let currentSavedEstimate = savedEstimate;
  let recommendationReads = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });
    if (url.endsWith("/leads/lead-1") && method === "GET") return response({ id: "lead-1", clientName: "Asha Shah", projectName: "Asha home", location: "Pune", propertyType: "2BHK" });
    if (url.endsWith("/leads/lead-1/estimate") && method === "GET") return response(currentSavedEstimate);
    if (url.endsWith("/leads/lead-1/estimate") && method === "PUT") {
      const input = JSON.parse(String(init?.body)) as (typeof savedInputs)[number];
      savedInputs.push(input);
      await saveGate;
      const draft = savedConfiguredEstimate("rev-pop");
      if (echoDraftSave) {
        currentSavedEstimate = {
          ...draft, status: "draft", version: Number((currentSavedEstimate as { version?: number } | null)?.version ?? 0) + 1,
          rooms: input.rooms, selectedMainBasketIds: input.selectedMainBasketIds,
          lineItems: input.lineItems.filter((line) => line.source === "configuration").map((line) => {
            const basket = catalogue.items.find((item) => item.id === line.mainBasketId)!;
            const subBasket = basket.subBaskets.find((item) => item.id === line.subBasketId)!;
            const mainLine = subBasket.mainLines.find((item) => item.mainLineId === line.mainLineId)!;
            const amountPaise = line.included ? Math.round((line.ratePaise ?? 0) * line.quantity) : 0;
            return {
              ...draft.lineItems[0], ...line, id: line.id ?? `saved-${line.mainLineId}`,
              mainBasketName: basket.name, subBasketName: subBasket.name, mainLineName: mainLine.name,
              revisionId: mainLine.revisionId, sourceItemVersion: mainLine.itemVersion,
              sourceRevisionVersion: mainLine.revisionVersion, uomId: mainLine.uom.id,
              uomCode: mainLine.uom.code, uomName: mainLine.uom.name, uomDecimalScale: mainLine.uom.decimalScale,
              unit: mainLine.uom.name, rate: line.ratePaise === null ? null : line.ratePaise / 100,
              amount: amountPaise / 100, amountPaise
            };
          })
        };
        return response(currentSavedEstimate);
      }
      return response({ ...draft, status: "draft", version: 1, rooms: input.rooms,
        selectedMainBasketIds: input.selectedMainBasketIds,
        lineItems: [{ ...draft.lineItems[0], roomId: input.rooms[0]?.id, roomName: input.rooms[0]?.label }] });
    }
    if (url.includes("/estimation/catalogue?") && method === "GET") return response(readCatalogue());
    if (url.includes("/estimation/catalogue/recommendations?") && method === "GET") {
      recommendationReads += 1;
      const ids = new URL(url, "http://localhost").searchParams.get("mainLineIds")?.split(",") ?? [];
      calls.push(ids);
      if (failFirstRecommendation && recommendationReads === 1) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed" } }, { status: 503 });
      await (typeof recommendationGate === "function" ? recommendationGate(ids) : recommendationGate);
      return response({ sources: ids.map((mainLineId) => ({ mainLineId, available: true, ...revisions[mainLineId],
        rules: rulesForSource?.(mainLineId) ?? (mainLineId === "line-pop" ? [{ id: "rule-paint", requirement: "must", reason: "Painting completes the ceiling surface.", targetKind: "main_line", targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: "line-paint", targetRevisionId: "rev-paint", targetRevisionVersion: 1, targetItemVersion: 1, available: true, completionRequired: false }]
          : mainLineId === "line-functional" ? [sharedTarget
            ? { id: "rule-shared-paint", requirement: "can", reason: "Finish the ceiling around the fittings.", targetKind: "main_line", targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: "line-paint", targetRevisionId: "rev-paint", targetRevisionVersion: 1, targetItemVersion: 1, available: true, completionRequired: false }
            : { id: "rule-light", requirement: "can", reason: "Provide fittings at the ceiling openings.", targetKind: "main_line", targetBasketId: "basket-light", targetSubBasketId: "sub-light", targetMainLineId: "line-light", targetRevisionId: "rev-light", targetRevisionVersion: 1, targetItemVersion: 1, available: true, completionRequired: false }]
            : []),
        guidance: [] })) });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  return { calls, savedInputs, requests };
}

function savedConfiguredEstimate(revisionId: string) {
  return {
    id: "estimate-saved", version: 2, propertyType: "2BHK", status: "ready_for_client", approvalRequired: false,
    rooms: [{ id: "room-living", label: "Living & Dining", icon: "", typeId: "living", sqft: 300, length: null, width: null }],
    scopes: [], selectedMainBasketIds: ["basket-pop"], subtotal: 100, gst: 18, total: 118,
    lineItems: [{ id: "saved-pop", source: "configuration", itemType: "main_line", catalogueId: "line-pop",
      roomId: "room-living", roomName: "Living & Dining", mainBasketId: "basket-pop", mainBasketName: "POP / Gypsum",
      subBasketId: "sub-ceiling", subBasketName: "False Ceiling", mainLineId: "line-pop", mainLineName: "POP false ceiling",
      revisionId, sourceItemStatus: "active", sourceRevisionStatus: "active", sourceItemVersion: revisionId === "rev-pop" ? 3 : 2,
      sourceRevisionVersion: revisionId === "rev-pop" ? 2 : 1, uomId: "uom-sqft", uomCode: "SQFT", uomName: "sq ft",
      uomDecimalScale: 2, unit: "sq ft", specification: null, rate: 100, ratePaise: 10_000, quantity: 1,
      included: true, amount: 100, amountPaise: 10_000 }]
  };
}

function renderWorkspace() {
  return renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead-1/estimate"]}>
    <Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace />} /></Routes>
  </MemoryRouter>);
}

async function openBuilder(user: ReturnType<typeof userEvent.setup>, additionalBasketNames: string[] = []) {
  await screen.findByRole("heading", { name: "Main Baskets" });
  await user.click(screen.getByRole("button", { name: "Select rooms" }));
  await user.click(screen.getByRole("checkbox", { name: "Living & Dining" }));
  await user.click(screen.getByRole("checkbox", { name: "Bedroom 1" }));
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
  for (const name of additionalBasketNames) await user.click(screen.getByRole("button", { name: `Add ${name}` }));
  await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
}

async function addItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = screen.getByRole("button", { name: "Add items" });
  if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
  await user.click(await selectPickerLine(user, "POP / Gypsum", "False Ceiling", name));
  const closePicker = screen.queryByRole("button", { name: "Close item picker" });
  if (closePicker) await user.click(closePicker);
}
const selectedItem = (name: RegExp) => screen.getByRole("checkbox", { name });

const paintRule = (overrides: Partial<EstimationRecommendationRule> = {}): EstimationRecommendationRule => ({
  id: "paint", requirement: "must", reason: "Finish the ceiling", targetKind: "main_line", targetBasketId: "basket-paint",
  targetSubBasketId: "sub-paint", targetMainLineId: "line-paint", targetRevisionId: "rev-paint", targetRevisionVersion: 1,
  targetItemVersion: 1, available: true, completionRequired: false, ...overrides
});
const lightRule = (overrides: Partial<EstimationRecommendationRule> = {}): EstimationRecommendationRule => paintRule({
  id: "light", targetBasketId: "basket-light", targetSubBasketId: "sub-light", targetMainLineId: "line-light", targetRevisionId: "rev-light", ...overrides
});
async function expectSaveReady() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
}
async function saveDraft(user: ReturnType<typeof userEvent.setup>) {
  await expectSaveReady();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Estimate draft saved.");
}

describe("estimator automatic required and probable recommendations", () => {
  it("adds two required items once without a popup and saves their same-room origins", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    const { savedInputs, requests } = installReads(false, null, undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule(), lightRule()] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(await screen.findByRole("checkbox", { name: /False ceiling functional lights/ })).toBeChecked();
    expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument();
    expect(requests.filter(request => request.method !== "GET")).toEqual([]);
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.included)).toHaveLength(3);
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.mainLineId !== "line-pop").every(line =>
      line.roomName === "Living & Dining" && line.recommendationSourceMainLineIds?.join() === "line-pop")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Refresh available items/ }));
    await expectSaveReady();
    expect(screen.getAllByRole("checkbox", { name: /False ceiling painting/ })).toHaveLength(1);
  });

  it("offers probable Add and Ignore, permits reconsideration, and never auto-adds ignored scope", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace(); await openBuilder(user); await addItem(user, "Functional Lights");
    let dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Ignore False ceiling functional lights" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument());
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.included).map(line => line.mainLineId)).toEqual(["line-functional"]);
    await user.click(screen.getByRole("button", { name: /^Probable items/ }));
    dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling functional lights" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument());
    expect(selectedItem(/False ceiling functional lights/)).toBeChecked();
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-light")).toMatchObject({ included: true, recommendationSourceMainLineIds: ["line-functional"] });
  });

  it("auto-adds required scope independently of a mixed probable popup and its Close action", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule(), lightRule({ requirement: "can" })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    const dialog = await screen.findByRole("dialog", { name: "Probable items" });
    expect(within(dialog).queryByText("False ceiling painting")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.included).map(line => line.mainLineId).sort()).toEqual(["line-paint", "line-pop"]);
  });

  it("waits for required descendants before enabling Save and adds a chain without prompts", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, ids => ids.includes("line-paint") ? gate : undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule()] : id === "line-paint" ? [lightRule()] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await act(async () => release());
    expect(await screen.findByRole("checkbox", { name: /False ceiling functional lights/ })).toBeChecked();
    await expectSaveReady();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("resolves pending required work in its original room while Save is blocked in another room", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { savedInputs } = installReads(false, null, gate, false, undefined, true);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await act(async () => release());
    await expectSaveReady();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.included).every(line => line.roomName === "Living & Dining")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
  });

  it("keeps a verified required target protected when its descendant read fails", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, ids => {
      if (ids.includes("line-paint")) throw new Error("Synthetic descendant read failure");
    });
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findAllByText("Required items need review. Refresh available items before saving or submitting.");
    const target = selectedItem(/False ceiling painting/);
    expect(target).toBeChecked();
    expect(target).toBeDisabled();
    expect(target).toHaveAccessibleName(/required by POP false ceiling/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(savedInputs).toHaveLength(0);
    await user.click(selectedItem(/^Include POP false ceiling/));
    await expectSaveReady();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
  });

  it("does not apply a delayed source response after that source was removed", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, gate);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await user.click(selectedItem(/^Include POP false ceiling/));
    await act(async () => release());
    await expectSaveReady();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
  });

  it("prevents required target removal, retains shared origins and cleans up after the final source", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true,
      id => ["line-pop", "line-functional"].includes(id) ? [paintRule({ id: `paint-${id}` })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeDisabled();
    await addItem(user, "Functional Lights"); await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-paint")?.recommendationSourceMainLineIds?.sort()).toEqual(["line-functional", "line-pop"]);
    await user.click(selectedItem(/^Include POP false ceiling/));
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    await user.click(selectedItem(/^Include Functional Lights/));
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-paint")).toMatchObject({ included: false, recommendationSourceMainLineIds: [] });
  });

  it("cleans an orphan required cycle after its independent parent is removed", async () => {
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule()] : id === "line-paint" ? [lightRule()] : id === "line-light" ? [paintRule({ id: "cycle" })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findByRole("checkbox", { name: /False ceiling functional lights/ }); await expectSaveReady();
    await user.click(selectedItem(/^Include POP false ceiling/));
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /False ceiling functional lights/ })).not.toBeInTheDocument();
    await expectSaveReady();
  });

  it("preserves selected target quantities and origins across save and reload without duplication", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    let rendered = renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findByRole("checkbox", { name: /False ceiling painting/ });
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ });
    fireEvent.change(quantity, { target: { value: "7.5" } });
    await saveDraft(user); rendered.unmount(); rendered = renderWorkspace();
    await screen.findByRole("checkbox", { name: /False ceiling painting/ }); await expectSaveReady();
    expect(screen.getAllByRole("checkbox", { name: /False ceiling painting/ })).toHaveLength(1);
    expect(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ })).toHaveValue(7.5);
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-paint")).toMatchObject({ id: "saved-line-paint", quantity: 7.5, recommendationSourceMainLineIds: ["line-pop"] });
  });

  it("keeps failed required reads visible, blocks Save and retries without removing the source", async () => {
    const user = userEvent.setup(); installReads(true);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findAllByText("Required items need review. Refresh available items before saving or submitting.");
    expect(selectedItem(/^Include POP false ceiling/)).toBeChecked();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: /Refresh available items/ })[0]!);
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    await expectSaveReady();
  });

  it("does not invent an unavailable required price and keeps it in review", async () => {
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, true, id => id === "line-pop" ? [paintRule({
      available: false, targetDisplay: { name: "False ceiling painting", unavailableReason: "price_not_configured" }
    })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findAllByText(/False ceiling painting is required and needs review/);
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(builderActions.select?.({ mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint" })).toBe(false);
  });

  it("does not let unavailable or stale optional target evidence block Save", async () => {
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, true, id => id === "line-pop" ? [paintRule({
      requirement: "can", targetRevisionVersion: 99
    }), lightRule({ requirement: "can", available: false })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await expectSaveReady();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    await saveDraft(user);
  });

  it("never auto-adds into a submitted read-only estimate", async () => {
    const { requests } = installReads(false, savedConfiguredEstimate("rev-pop"));
    renderWorkspace();
    expect(await screen.findByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    await screen.findByRole("button", { name: /Non-negotiable recommendations/ });
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(requests.filter(request => request.method !== "GET")).toEqual([]);
  });

  it("blocks historical source identities in an editable draft until Configuration is reviewed", async () => {
    const current = structuredClone(catalogue);
    current.items[0]!.subBaskets[0]!.mainLines = current.items[0]!.subBaskets[0]!.mainLines.filter(item => item.mainLineId !== "line-pop");
    installReads(false, { ...savedConfiguredEstimate("old-revision"), status: "draft" }, undefined, false, undefined, false, undefined, () => current); renderWorkspace();
    await screen.findAllByText(/required items need review. Refresh available items/);
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("preserves a manually selected target and its quantity after its requiring source is removed", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace(); await openBuilder(user, ["Painting"]);
    await user.click(screen.getByRole("button", { name: "Add items" }));
    await user.click(await selectPickerLine(user, "Painting", "Ceiling finish", "False ceiling painting"));
    const closePicker = screen.queryByRole("button", { name: "Close item picker" });
    if (closePicker) await user.click(closePicker);
    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ }), { target: { value: "9.25" } });
    await addItem(user, "POP false ceiling"); await expectSaveReady();
    await user.click(selectedItem(/^Include POP false ceiling/));
    expect(selectedItem(/^Include False ceiling painting/)).toBeChecked();
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-paint")).toMatchObject({ included: true, quantity: 9.25, recommendationSourceMainLineIds: [] });
  });

  it.each([false, true])("preserves explicit Setup basket ownership: %s", async explicit => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace(); await openBuilder(user, explicit ? ["Painting"] : []); await addItem(user, "POP false ceiling");
    await screen.findByRole("checkbox", { name: /False ceiling painting/ }); await saveDraft(user);
    await user.click(selectedItem(/^Include POP false ceiling/)); await saveDraft(user);
    expect(savedInputs.at(-1)?.selectedMainBasketIds.includes("basket-paint")).toBe(explicit);
    expect(savedInputs.at(-1)?.selectedMainBasketIds).toContain("basket-pop");
  });

  it("adds required dimensions as incomplete without copying parent quantities or moving focus", async () => {
    const user = userEvent.setup();
    const current: EstimationCatalogue = structuredClone(catalogue);
    Object.assign(current.items[1]!.subBaskets[0]!.mainLines[0]!, { dimensionsMandatory: true,
      dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "uom-sqft", decimalScale: 2 } });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, ids => ids.length === 1 ? gate : undefined, false, undefined, true, undefined, () => current);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    const parentQuantity = screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ });
    fireEvent.change(parentQuantity, { target: { value: "17" } }); parentQuantity.focus();
    await act(async () => release());
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(parentQuantity).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /Length.*False ceiling painting/ })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves an edit made during Save while adopting the returned saved row ID and version", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { savedInputs } = installReads(false, null, undefined, false, gate, true);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling"); await expectSaveReady();
    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ }), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(1));
    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ }), { target: { value: "11" } });
    await act(async () => release()); await screen.findByText("Estimate draft saved."); await expectSaveReady();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ })).toHaveValue(11);
    await saveDraft(user);
    expect(savedInputs.at(-1)?.expectedVersion).toBe(1);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-paint")).toMatchObject({ id: "saved-line-paint", quantity: 11, recommendationSourceMainLineIds: ["line-pop"] });
  });

  it("stops automatic inclusion when a refreshed estimate becomes locked during a source read", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const draft = { ...savedConfiguredEstimate("rev-pop"), status: "draft" };
    const { calls, requests } = installReads(false, draft, gate);
    renderWorkspace(); await screen.findByRole("checkbox", { name: /^Include POP false ceiling/ });
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    draft.status = "ready_for_client";
    await user.click(screen.getAllByRole("button", { name: /Refresh available items/ })[0]!);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument());
    await act(async () => release());
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    expect(requests.filter(request => request.method !== "GET")).toEqual([]);
  });

  it("adding a probable target also automatically includes its required descendants", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule({ requirement: "can" })] : id === "line-paint" ? [lightRule()] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    const dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument());
    expect(await screen.findByRole("checkbox", { name: /^Include False ceiling functional lights/ })).toBeChecked();
    await saveDraft(user);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-light")).toMatchObject({ recommendationSourceMainLineIds: ["line-paint"] });
  });

  it("expands required Sub Basket children and blocks Save for unresolved remaining children", async () => {
    const user = userEvent.setup();
    const current = structuredClone(catalogue);
    current.items[1]!.subBaskets[0]!.mainLines = current.items[1]!.subBaskets[0]!.mainLines.slice(0, 1);
    installReads(false, null, undefined, false, undefined, true, id => id === "line-pop" ? [paintRule({
      targetKind: "sub_basket", targetMainLineId: null, unavailableChildCount: 1,
      children: [{ mainLineId: "line-paint", revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1,
        available: true, completionRequired: false }]
    })] : [], () => current);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    await screen.findAllByText(/Ceiling finish is required and needs review/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reopens probable items after selecting or deselecting a source and never opens an empty last-source popup", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule({ requirement: "can" })] : id === "line-functional" ? [lightRule({ requirement: "can" })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    let dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    await addItem(user, "Functional Lights");
    dialog = await screen.findByRole("dialog", { name: "Probable items" });
    expect(within(dialog).getByRole("button", { name: "Add False ceiling painting" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Add False ceiling functional lights" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    await user.click(selectedItem(/^Include POP false ceiling/));
    dialog = await screen.findByRole("dialog", { name: "Probable items" });
    expect(within(dialog).getByRole("button", { name: "Add False ceiling functional lights" })).toBeEnabled();
    expect(within(dialog).queryByRole("button", { name: "Add False ceiling painting" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("POP false ceiling")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    await user.click(selectedItem(/^Include Functional Lights/));
    await expectSaveReady();
    expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument();
  });

  it("reoffers an ignored item after source reselection but keeps dismissal through quantity edits and refresh", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    const { calls } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace(); await openBuilder(user); await addItem(user, "Functional Lights");
    let dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Ignore False ceiling functional lights" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole("spinbutton", { name: /Quantity.*Functional Lights/ }), { target: { value: "3" } });
    const readCount = calls.length;
    await user.click(screen.getByRole("button", { name: /Refresh available items/ }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(readCount));
    await expectSaveReady();
    expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument();
    await user.click(selectedItem(/^Include Functional Lights/));
    await expectSaveReady();
    expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument();
    await addItem(user, "Functional Lights");
    dialog = await screen.findByRole("dialog", { name: "Probable items" });
    expect(within(dialog).getByRole("button", { name: "Add False ceiling functional lights" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Ignore False ceiling functional lights" })).toBeEnabled();
  });

  it("keeps a mixed popup dismissed when delayed automatic required descendants are added", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, ids => ids.includes("line-paint") && !ids.includes("line-functional") ? gate : undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule(), lightRule({ requirement: "can" })]
        : id === "line-paint" ? [paintRule({ id: "required-fitting", targetBasketId: "basket-pop", targetSubBasketId: "sub-ceiling",
          targetMainLineId: "line-functional", targetRevisionId: "rev-functional" })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    const dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    await act(async () => release());
    expect(await screen.findByRole("checkbox", { name: /^Include Functional Lights/ })).toBeChecked();
    await expectSaveReady();
    expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /^Include False ceiling functional lights/ })).not.toBeInTheDocument();
  });

  it("preserves one room's ignored suggestions when manual source selections change in another room", async () => {
    authState.role = "estimator_sales";
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, true,
      id => id === "line-pop" ? [paintRule({ requirement: "can" })] : id === "line-functional" ? [lightRule({ requirement: "can" })] : []);
    renderWorkspace(); await openBuilder(user); await addItem(user, "Functional Lights");
    let dialog = await screen.findByRole("dialog", { name: "Probable items" });
    await user.click(within(dialog).getByRole("button", { name: "Ignore False ceiling functional lights" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    await addItem(user, "POP false ceiling");
    dialog = await screen.findByRole("dialog", { name: "Probable items" });
    expect(within(dialog).getByRole("button", { name: "Add False ceiling painting" })).toBeEnabled();
    expect(within(dialog).queryByRole("button", { name: "Add False ceiling functional lights" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    await expectSaveReady();
    expect(screen.queryByRole("dialog", { name: "Probable items" })).not.toBeInTheDocument();
    await addItem(user, "POP false ceiling");
    dialog = await screen.findByRole("dialog", { name: "Probable items" });
    expect(within(dialog).getByRole("button", { name: "Add False ceiling painting" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Ignore False ceiling functional lights" })).toBeEnabled();
  });

});
