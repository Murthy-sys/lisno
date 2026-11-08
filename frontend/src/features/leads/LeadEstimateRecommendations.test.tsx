import { act, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const authState = vi.hoisted(() => ({ role: undefined as string | undefined }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "test-estimator", role: authState.role }, reviewSession: { id: "test-session" }, status: "authenticated" }) }));
beforeEach(() => { authState.role = undefined; });
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));


import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import type { EstimationRecommendationRule } from "./estimationCatalogueApi";

const response = (data: unknown) => Response.json({ data });
const uom = { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 };
const catalogue = { items: [
  { id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [], subBaskets: [{ id: "sub-ceiling", basketId: "basket-pop", name: "False Ceiling", displayOrder: 1, mainLines: [
    { id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "POP false ceiling", displayOrder: 1, revisionId: "rev-pop", revisionVersion: 2, itemVersion: 3, inHouseBaseRatePaise: 10_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 10_000, in_house: 10_000 }, uom },
    { id: "line-functional", mainLineId: "line-functional", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "Functional Lights", displayOrder: 2, revisionId: "rev-functional", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 15_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 15_000, in_house: 15_000 }, uom }
  ] }] },
  { id: "basket-paint", name: "Painting", displayOrder: 2, directTemporaryItems: [], subBaskets: [{ id: "sub-paint", basketId: "basket-paint", name: "Ceiling finish", displayOrder: 1, mainLines: [
    { id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint", name: "False ceiling painting", displayOrder: 1, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 25_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 25_000, in_house: 25_000 }, uom }
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

function installReads(failFirstRecommendation = false, savedEstimate: unknown = null, recommendationGate?: Promise<void>, sharedTarget = false, saveGate?: Promise<void>, echoDraftSave = false, rulesForSource?: (sourceId: string) => EstimationRecommendationRule[]) {
  const calls: string[][] = [];
  const requests: Array<{ url: string; method: string }> = [];
  const savedInputs: Array<{ rooms: Array<{ id: string; label: string }>; selectedMainBasketIds: string[]; lineItems: Array<{
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
          ...draft, status: "draft", version: savedInputs.length,
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
    if (url.includes("/estimation/catalogue?") && method === "GET") return response(catalogue);
    if (url.includes("/estimation/catalogue/recommendations?") && method === "GET") {
      recommendationReads += 1;
      const ids = new URL(url, "http://localhost").searchParams.get("mainLineIds")?.split(",") ?? [];
      calls.push(ids);
      if (failFirstRecommendation && recommendationReads === 1) return Response.json({ error: { code: "UNAVAILABLE", message: "Read failed" } }, { status: 503 });
      await recommendationGate;
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
  await user.click(screen.getByRole("option", { name: "Living & Dining" }));
  await user.click(screen.getByRole("option", { name: "Bedroom 1" }));
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
  for (const name of additionalBasketNames) await user.click(screen.getByRole("button", { name: `Add ${name}` }));
  await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
}

async function addItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = screen.getByRole("button", { name: "Add items" });
  if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
  await user.click(screen.getByRole("button", { name: `Add ${name}` }));
}
const selectedItem = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("estimator inline recommendations", () => {
  it("keeps basket selection empty, adds only an explicit room item, and hides probable suggestions", async () => {
    const user = userEvent.setup();
    installReads(); renderWorkspace(); await openBuilder(user);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await addItem(user, "Functional Lights");
    expect(selectedItem(/Functional Lights/)).toBeChecked();
    await waitFor(() => expect(screen.queryByText("Checking non-negotiable recommendations…")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps a source selected when recommendations are collapsed, adds only the target and preserves removal after saving", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    let rendered = renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    const disclosure = await screen.findByRole("button", { name: /Non-negotiable recommendations/ });
    await user.click(disclosure);
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(disclosure);
    const recommendations = screen.getByRole("region", { name: "Non-negotiable recommendations for Living & Dining" });
    await user.click(within(recommendations).getByRole("button", { name: "Add False ceiling painting" }));
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /False ceiling functional lights/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.included)).toHaveLength(2);
    expect(savedInputs.at(-1)?.lineItems.find(line => line.mainLineId === "line-paint")).toMatchObject({ roomName: "Living & Dining", recommendationSourceMainLineIds: ["line-pop"] });
    await user.click(await within(recommendations).findByRole("button", { name: "Remove False ceiling painting" }));
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(2));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs[1]!.lineItems.find(line => line.mainLineId === "line-paint")).toMatchObject({ id: "saved-line-paint", included: false });
    rendered.unmount(); rendered = renderWorkspace();
    expect(await screen.findByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
  });

  it("removes a dependent when its source is removed without changing another room", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    await addItem(user, "POP false ceiling");
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    await user.click(selectedItem(/POP false ceiling/));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs.at(-1)?.lineItems.filter(line => line.included)).toEqual([expect.objectContaining({ mainLineId: "line-pop", roomName: "Bedroom 1" })]);
  });

  it("keeps a failed read distinct from empty recommendations and retries without removing the source", async () => {
    const user = userEvent.setup();
    installReads(true); renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findByText("Recommendations could not be loaded.");
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Retry recommendations" }));
    expect(await screen.findByRole("button", { name: "Add False ceiling painting" })).toBeEnabled();
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
  });

  it("does not apply a delayed recommendation response to a different room", async () => {
    const user = userEvent.setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, gate); renderWorkspace(); await openBuilder(user); await addItem(user, "POP false ceiling");
    await screen.findByText("Checking non-negotiable recommendations…");
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    await act(async () => release());
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
  });

  it("keeps a persisted read-only estimate read-only while displaying current recommendations", async () => {
    installReads(false, savedConfiguredEstimate("rev-pop")); renderWorkspace();
    expect(await screen.findByRole("checkbox", { name: /POP false ceiling/ })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Add False ceiling painting" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add items" })).not.toBeInTheDocument();
  });

  it("explains historical source availability without looking up another source revision", async () => {
    const { calls } = installReads(false, savedConfiguredEstimate("rev-historical")); renderWorkspace();
    expect(await screen.findByText("Saved recommendation sources need review against current Configuration.")).toBeVisible();
    expect(calls).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Sales recommendation popup", () => {
  beforeEach(() => { authState.role = "estimator_sales"; });

  it("keeps dismissal through source changes, refresh and Summary while rooms remain independent", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(); renderWorkspace(); await openBuilder(user);
    await user.click(selectedItem(/POP false ceiling/));
    const trigger = await screen.findByRole("button", { name: "Recommendations (1)" });
    await user.click(await screen.findByRole("button", { name: "Close recommendations" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    await user.click(selectedItem(/Functional Lights/));
    await waitFor(() => expect(trigger).toHaveAccessibleName("Recommendations (1)"));
    expect(screen.queryByRole("button", { name: "Close recommendations" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(trigger).toHaveAccessibleName("Recommendations (1)"));
    await user.click(screen.getByRole("button", { name: "Summary" }));
    await user.click(screen.getByRole("button", { name: "Estimate Builder" }));
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    expect(screen.queryByRole("button", { name: /Recommendations/ })).not.toBeInTheDocument();
    await user.click(selectedItem(/POP false ceiling/));
    const bedroom = await screen.findByRole("region", { name: "Non-negotiable recommendations for Bedroom 1" });
    expect(bedroom).toBeVisible();
    await user.click(within(bedroom).getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
    expect(savedInputs).toEqual([]);
  });

  it("preserves typing during automatic discovery and saves only explicit selections with their original values", async () => {
    const user = userEvent.setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { savedInputs } = installReads(false, null, gate, false, undefined, true);
    renderWorkspace(); await openBuilder(user);
    await user.click(selectedItem(/POP false ceiling/));
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ });
    await user.clear(quantity); await user.type(quantity, "7");
    const price = screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    await user.clear(price); await user.type(price, "123.");
    await act(async () => release());
    await screen.findByRole("button", { name: "Close recommendations" });
    expect(price).toHaveFocus();
    await user.type(price, "45");
    expect(price).toHaveValue("123.45");
    const popup = screen.getByRole("region", { name: "Non-negotiable recommendations for Living & Dining" });
    await user.click(within(popup).getByRole("button", { name: "Add False ceiling painting" }));
    expect(await within(popup).findByRole("button", { name: "Remove False ceiling painting" })).toBeEnabled();
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    await user.click(within(popup).getByRole("button", { name: "Remove False ceiling painting" }));
    expect(selectedItem(/False ceiling painting/)).not.toBeChecked();
    await user.click(within(popup).getByRole("button", { name: "Close recommendations" }));
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(quantity).toHaveValue(7); expect(price).toHaveValue("123.45");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs).toHaveLength(1);
    expect(savedInputs[0]!.lineItems).toEqual([expect.objectContaining({ mainLineId: "line-pop", quantity: 7, ratePaise: 12345, included: true })]);
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps late results in their source room and does not close when another modal handles Escape", async () => {
    const user = userEvent.setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, gate); renderWorkspace(); await openBuilder(user);
    await user.click(selectedItem(/POP false ceiling/));
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    await act(async () => release());
    expect(screen.queryByRole("button", { name: /Recommendations/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    const popup = await screen.findByRole("region", { name: "Non-negotiable recommendations for Living & Dining" });
    await user.click(screen.getByRole("button", { name: "Remove False Ceiling Sub Basket from Living & Dining" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(popup.closest("[inert]")).not.toBeNull();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close recommendations" })).toBeVisible();
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
  });

  it("keeps failed reads discoverable while closed and supports retry without changing selections", async () => {
    const user = userEvent.setup();
    installReads(true); renderWorkspace(); await openBuilder(user);
    await user.click(selectedItem(/POP false ceiling/));
    const trigger = await screen.findByRole("button", { name: /Recommendations.*Could not load/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Retry recommendations" }));
    expect(await screen.findByRole("button", { name: "Add False ceiling painting" })).toBeEnabled();
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
  });

  it("leaves submitted Sales estimates in their existing read-only inline presentation", async () => {
    installReads(false, savedConfiguredEstimate("rev-pop")); renderWorkspace();
    expect(await screen.findByRole("button", { name: "Add False ceiling painting" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Non-negotiable recommendations (1)" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Close recommendations" })).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: /POP false ceiling/ })).toBeDisabled();
  });

  it("uses each room's current targets and preserves the popup during a reopened draft save", async () => {
    const user = userEvent.setup(); let releaseSave!: () => void;
    const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
    const saved = { ...savedConfiguredEstimate("rev-pop"), status: "client_changes_requested",
      rooms: [...savedConfiguredEstimate("rev-pop").rooms, { id: "room-bed", label: "Bedroom 1", icon: "", typeId: "bedroom_1", sqft: 144, length: null, width: null }] };
    const { savedInputs } = installReads(false, saved, undefined, false, saveGate, true, source => {
      const target = source === "line-pop" ? "paint" : source === "line-functional" ? "light" : null;
      return target ? [{ id: `rule-${target}`, requirement: "must", reason: "Complete the selected work.", targetKind: "main_line", targetBasketId: `basket-${target}`, targetSubBasketId: `sub-${target}`, targetMainLineId: `line-${target}`, targetRevisionId: `rev-${target}`, targetRevisionVersion: 1, targetItemVersion: 1, available: true, completionRequired: false }] : [];
    });
    renderWorkspace();
    await screen.findByRole("button", { name: "Add False ceiling painting" });
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    await user.click(selectedItem(/Functional Lights/));
    const popup = await screen.findByRole("region", { name: "Non-negotiable recommendations for Bedroom 1" });
    expect(within(popup).queryByText("False ceiling painting")).not.toBeInTheDocument();
    await user.click(within(popup).getByRole("button", { name: "Add False ceiling functional lights" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(1));
    expect(screen.getByRole("region", { name: "Non-negotiable recommendations for Bedroom 1" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Non-negotiable recommendations (1)" })).not.toBeInTheDocument();
    await act(async () => releaseSave());
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs[0]!.lineItems.filter(line => line.included)).toEqual(expect.arrayContaining([
      expect.objectContaining({ roomId: "room-living", mainLineId: "line-pop", ratePaise: 10000, quantity: 1 }),
      expect.objectContaining({ roomId: "room-bed", mainLineId: "line-functional", ratePaise: 15000 }),
      expect.objectContaining({ roomId: "room-bed", mainLineId: "line-light", recommendationSourceMainLineIds: ["line-functional"] })
    ]));
    expect(savedInputs[0]!.lineItems.filter(line => line.included)).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
  });
});
