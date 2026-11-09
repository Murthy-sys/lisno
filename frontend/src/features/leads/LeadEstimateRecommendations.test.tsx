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
    { id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "POP false ceiling", displayOrder: 1, revisionId: "rev-pop", revisionVersion: 2, itemVersion: 3, inHouseBaseRatePaise: 10_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 10_000, in_house: 10_000 }, uom },
    { id: "line-functional", mainLineId: "line-functional", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "Functional Lights", displayOrder: 2, revisionId: "rev-functional", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 15_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 15_000, in_house: 15_000 }, uom }
  ] }] },
  { id: "basket-paint", name: "Painting", displayOrder: 2, directTemporaryItems: [], subBaskets: [{ id: "sub-paint", basketId: "basket-paint", name: "Ceiling finish", displayOrder: 1, mainLines: [
    { id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint", name: "False ceiling painting", displayOrder: 1, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 25_000, modeBaseRatesPaise: { pmc: 8_000, sub_vendor: 25_000, in_house: 25_000 }, uom },
    { id: "line-primer", mainLineId: "line-primer", basketId: "basket-paint", subBasketId: "sub-paint", name: "Ceiling primer", displayOrder: 2, revisionId: "rev-primer", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 12_000, modeBaseRatesPaise: { pmc: 5_000, sub_vendor: 12_000, in_house: 12_000 }, uom },
    { id: "line-coating", mainLineId: "line-coating", basketId: "basket-paint", subBasketId: "sub-paint", name: "Protective coating", displayOrder: 3, revisionId: "rev-coating", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 18_000, modeBaseRatesPaise: { pmc: 7_000, sub_vendor: 18_000, in_house: 18_000 }, uom }
  ] }, { id: "sub-wall", basketId: "basket-paint", name: "Wall finish", displayOrder: 2, mainLines: [
    { id: "line-wall", mainLineId: "line-wall", basketId: "basket-paint", subBasketId: "sub-wall", name: "Feature wall texture", displayOrder: 1, revisionId: "rev-wall", revisionVersion: 1, itemVersion: 1, inHouseBaseRatePaise: 32_000, modeBaseRatesPaise: { pmc: 10_000, sub_vendor: 32_000, in_house: 32_000 }, uom }
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
  const closePicker = screen.queryByRole("button", { name: "Close item picker" });
  if (closePicker) await user.click(closePicker);
}
const selectedItem = (name: RegExp) => screen.getByRole("checkbox", { name });

async function expectRecommendationsCompleted() {
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Non-negotiable recommendations" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: /^Recommendations/ })).toHaveAttribute("aria-expanded", "false");
}

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

  it("keeps an unavailable unpriced must target in review and rejects its stale local Add callback", async () => {
    const user = userEvent.setup();
    const current: EstimationCatalogue = structuredClone(catalogue);
    current.items[0]!.subBaskets[0]!.mainLines[0]!.hasConfiguredBasePrice = false;
    current.items[1]!.subBaskets[0]!.mainLines[0]!.hasConfiguredBasePrice = false;
    const { savedInputs, requests, calls } = installReads(false, { ...savedConfiguredEstimate("rev-pop"), status: "draft" },
      undefined, false, undefined, false, undefined, () => current);
    renderWorkspace();
    expect(await screen.findByRole("region", { name: "Items without a positive base price" })).toBeVisible();
    await user.click(await screen.findByRole("button", { name: /Recommendations \(0\).*Review needed/ }));
    expect(await screen.findByText(/Some non-negotiable recommendations are unavailable/)).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add False ceiling painting" })).not.toBeInTheDocument();
    let accepted: boolean | void;
    act(() => { accepted = builderActions.select?.({ mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint" }); });
    expect(accepted!).toBe(false);
    expect(calls.some(ids => ids.includes("line-pop"))).toBe(true);
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
    expect(savedInputs).toEqual([]);
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });

  it("keeps the popup open after the final priced group Add when unpriced required children still need review", async () => {
    const user = userEvent.setup(), current: EstimationCatalogue = structuredClone(catalogue);
    current.items[1]!.subBaskets[0]!.mainLines[0]!.hasConfiguredBasePrice = true;
    current.items[1]!.subBaskets[0]!.mainLines[1]!.hasConfiguredBasePrice = false;
    current.items[1]!.subBaskets[0]!.mainLines[2]!.hasConfiguredBasePrice = false;
    const { savedInputs, requests } = installReads(false, { ...savedConfiguredEstimate("rev-pop"), status: "draft" },
      undefined, false, undefined, false, sourceId => sourceId === "line-pop" ? [{ id: "required-finish", requirement: "must", reason: "Complete the finish.",
        targetKind: "sub_basket", targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: null,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null, available: true, completionRequired: false,
        unavailableChildCount: 2, children: [{ mainLineId: "line-paint", available: true, completionRequired: false, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1 }] }] : [],
      () => current);
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    expect(await screen.findByRole("button", { name: "Remove False ceiling painting" })).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toBeVisible();
    expect(screen.getByText(/Some non-negotiable recommendations are unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Ceiling primer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Available items changed. Refresh before adding.")).not.toBeInTheDocument();
    expect(savedInputs).toEqual([]);
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });

  it("waits for refreshed chained suggestions and closes only after the final Add", async () => {
    const user = userEvent.setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { savedInputs, calls, requests } = installReads(false, { ...savedConfiguredEstimate("rev-pop"), status: "draft" },
      ids => ids.includes("line-paint") ? gate : undefined, false, undefined, false, source => {
        const target = source === "line-pop" ? "paint" : source === "line-paint" ? "light" : null;
        return target ? [{ id: `rule-${target}`, requirement: "must", reason: "Complete the selected work.",
          targetKind: "main_line", targetBasketId: `basket-${target}`, targetSubBasketId: `sub-${target}`,
          targetMainLineId: `line-${target}`, targetRevisionId: `rev-${target}`, targetRevisionVersion: 1,
          targetItemVersion: 1, available: true, completionRequired: false }] : [];
      });
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    await waitFor(() => expect(calls.some(ids => ids.includes("line-paint"))).toBe(true));
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toBeVisible();
    expect(screen.getByText("Checking non-negotiable recommendations…")).toBeVisible();
    await act(async () => release());
    expect(await screen.findByRole("button", { name: "Add False ceiling functional lights" })).toBeEnabled();
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add False ceiling functional lights" }));
    await expectRecommendationsCompleted();
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    expect(selectedItem(/False ceiling functional lights/)).toBeChecked();
    expect(savedInputs).toHaveLength(0);
    expect(requests.every(request => request.method === "GET")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Recommendations (2)" }));
    expect(screen.getByRole("button", { name: "Remove False ceiling painting" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove False ceiling functional lights" })).toBeEnabled();
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toBeVisible();
  });

  it("accepts one Sub Basket child once when equivalent Add callbacks arrive before a render", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, { ...savedConfiguredEstimate("rev-pop"), status: "draft" },
      undefined, false, undefined, true, source => source !== "line-pop" ? [] : [{
        id: "rule-finish", requirement: "must", reason: "Complete the ceiling finish.", targetKind: "sub_basket",
        targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: null,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null, available: true, completionRequired: false,
        children: ["paint", "primer", "coating"].map(name => ({ mainLineId: `line-${name}`, revisionId: `rev-${name}`,
          revisionVersion: 1, itemVersion: 1, available: true, completionRequired: false }))
      }]);
    renderWorkspace();
    await screen.findByRole("button", { name: "Add False ceiling painting" });
    expect(screen.getByRole("button", { name: "Add Ceiling primer" })).toBeEnabled();
    const target = { mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint" };
    const add = builderActions.select!;
    act(() => {
      expect(add(target)).toBe(true);
      expect(add(target)).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Ceiling primer|Protective coating|Feature wall texture/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs[0]!.lineItems).toHaveLength(2);
    expect(savedInputs[0]!.lineItems.filter(line => line.mainBasketId === "basket-paint")).toEqual([
      expect.objectContaining({ mainLineId: "line-paint", roomId: "room-living", quantity: 1, recommendationSourceMainLineIds: ["line-pop"], included: true })
    ]);
  });

  it("adds exactly one item, preserves both rooms and restores compact scope after saving", async () => {
    const user = userEvent.setup();
    const base = savedConfiguredEstimate("rev-pop");
    const saved = { ...base, status: "draft",
      rooms: [...base.rooms, { id: "room-bed", label: "Bedroom 1", icon: "", typeId: "bedroom_1", sqft: 144, length: null, width: null }],
      lineItems: [
        { ...base.lineItems[0], quantity: 2, rate: 123.45, ratePaise: 12345, rateSource: "manual", amount: 246.9, amountPaise: 24690 },
        { ...base.lineItems[0], id: "saved-functional", roomId: "room-bed", roomName: "Bedroom 1",
          catalogueId: "line-functional", mainLineId: "line-functional", mainLineName: "Functional Lights",
          revisionId: "rev-functional", sourceItemVersion: 1, sourceRevisionVersion: 1,
          quantity: 3, rate: 150, ratePaise: 15000, amount: 450, amountPaise: 45000 }
      ] };
    const { savedInputs } = installReads(false, saved, undefined, false, undefined, true);
    let rendered = renderWorkspace();
    const add = await screen.findByRole("button", { name: "Add False ceiling painting" });
    expect(screen.getByLabelText("Estimate amount before GST: ₹696.9")).toBeVisible();
    await user.click(add);
    expect(await screen.findByText("Added 1 item: False ceiling painting to Living & Dining.")).toBeVisible();
    await expectRecommendationsCompleted();
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveFocus();
    expect(savedInputs).toHaveLength(0);
    expect(screen.getAllByRole("checkbox").filter(item => (item as HTMLInputElement).checked)).toHaveLength(2);
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Ceiling primer|Protective coating|Feature wall texture/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Wall finish" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estimate amount before GST: ₹946.9")).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(2);
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("123.45");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs).toHaveLength(1);
    expect(savedInputs[0]!.selectedMainBasketIds).toEqual(["basket-pop", "basket-paint"]);
    expect(savedInputs[0]!.lineItems).toEqual([
      expect.objectContaining({ id: "saved-pop", roomId: "room-living", mainLineId: "line-pop", quantity: 2, ratePaise: 12345, rateSource: "manual", included: true }),
      expect.objectContaining({ id: "saved-functional", roomId: "room-bed", mainLineId: "line-functional", quantity: 3, ratePaise: 15000, included: true }),
      expect.objectContaining({ roomId: "room-living", mainLineId: "line-paint", quantity: 1, ratePaise: 25000, recommendationSourceMainLineIds: ["line-pop"], included: true })
    ]);

    await user.click(screen.getByRole("button", { name: "Browse other items in Painting" }));
    expect(selectedItem(/Ceiling primer/)).not.toBeChecked();
    expect(selectedItem(/Protective coating/)).not.toBeChecked();
    expect(selectedItem(/Feature wall texture/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Edit baskets" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(2));
    await screen.findByText("Estimate draft saved.");
    expect(selectedItem(/Ceiling primer/)).not.toBeChecked();
    expect(savedInputs[1]!.lineItems).toEqual(savedInputs[0]!.lineItems.map(line =>
      line.mainLineId === "line-paint" ? { ...line, id: "saved-line-paint" } : line));
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh available items" })).toBeEnabled());
    expect(selectedItem(/Ceiling primer/)).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByText("GST @ 18%").parentElement).toHaveTextContent("₹170.44");
    expect(screen.getByText("Total (incl. GST)").querySelector("strong")).toHaveTextContent(/^₹1,117$/);
    expect(screen.getByText("Round off").parentElement).toHaveTextContent("−₹0.34");
    await user.click(screen.getByRole("button", { name: "Estimate Builder" }));
    expect(selectedItem(/Ceiling primer/)).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    expect(screen.getByRole("button", { name: /^Bedroom 1/ })).toHaveTextContent("₹450");
    expect(selectedItem(/Functional Lights/)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting|Ceiling primer|Protective coating|Feature wall texture/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse other items in Painting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    expect(screen.queryByText("Added 1 item: False ceiling painting to Living & Dining.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(selectedItem(/Ceiling primer/)).not.toBeChecked();
    expect(savedInputs).toHaveLength(2);

    rendered.unmount(); rendered = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Close recommendations" }));
    expect(await screen.findByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Ceiling primer|Protective coating|Feature wall texture/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse other items in Painting" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    await user.click(await screen.findByRole("button", { name: "Remove False ceiling painting" }));
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    await expectRecommendationsCompleted();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(3));
    expect(savedInputs[2]!.lineItems.filter(line => line.mainLineId === "line-paint")).toEqual([
      expect.objectContaining({ id: "saved-line-paint", roomId: "room-living", quantity: 1, ratePaise: 25000, included: true, recommendationSourceMainLineIds: ["line-pop"] })
    ]);
  });

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
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: /Non-negotiable recommendations/ })).not.toBeInTheDocument();
    expect(savedInputs).toEqual([]);
  });

  it("preserves entered values when discovery opens a modal and saves only explicit selections", async () => {
    const user = userEvent.setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { savedInputs } = installReads(false, null, gate, false, undefined, true);
    renderWorkspace(); await openBuilder(user);
    await user.click(selectedItem(/POP false ceiling/));
    const quantity = screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ });
    await user.clear(quantity); await user.type(quantity, "7");
    const price = screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ });
    expect(price).toBeDisabled();
    const configuredPrice = (price as HTMLInputElement).value;
    fireEvent.change(price, { target: { value: "123." } });
    await act(async () => release());
    const close = await screen.findByRole("button", { name: "Close recommendations" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(price).toHaveValue(configuredPrice);
    await user.click(close);
    await user.type(price, "45");
    expect(price).toHaveValue(configuredPrice);
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    const popup = screen.getByRole("region", { name: "Non-negotiable recommendations for Living & Dining" });
    await user.click(within(popup).getByRole("button", { name: "Add False ceiling painting" }));
    await expectRecommendationsCompleted();
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    await user.click(screen.getByRole("button", { name: "Remove False ceiling painting" }));
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Recommendations (1)" });
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Close recommendations" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(quantity).toHaveValue(7); expect(price).toHaveValue(configuredPrice);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs).toHaveLength(1);
    expect(savedInputs[0]!.lineItems).toEqual([expect.objectContaining({ mainLineId: "line-pop", quantity: 7, ratePaise: Number(configuredPrice) * 100, included: true })]);
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps late results in their source room and restores recommendations after a separate confirmation", async () => {
    const user = userEvent.setup(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    installReads(false, null, gate); renderWorkspace(); await openBuilder(user);
    await user.click(selectedItem(/POP false ceiling/));
    await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
    await act(async () => release());
    expect(screen.queryByRole("button", { name: /Recommendations/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    await screen.findByRole("region", { name: "Non-negotiable recommendations for Living & Dining" });
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: "Remove False Ceiling Sub Basket from Living & Dining" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(screen.queryByRole("dialog", { name: "Non-negotiable recommendations" })).not.toBeInTheDocument();
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    expect(screen.getByRole("dialog", { name: "Non-negotiable recommendations" })).toBeVisible();
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
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
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
    await expectRecommendationsCompleted();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: /^Recommendations/ }));
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
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    await user.click(screen.getByRole("button", { name: /Living & Dining/ }));
    expect(screen.getByRole("button", { name: "Recommendations (1)" })).toHaveAttribute("aria-expanded", "false");
  });

  it("removes an automatic basket after its saved recommendation is removed and keeps it absent after save/reload", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, { ...savedConfiguredEstimate("rev-pop"), status: "draft" }, undefined, false, undefined, true);
    let view = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    await expectRecommendationsCompleted();
    expect(screen.getByRole("region", { name: "Painting" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    await user.click(await screen.findByRole("button", { name: "Remove False ceiling painting" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add False ceiling painting" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse other items in Painting" })).not.toBeInTheDocument();
    expect(selectedItem(/POP false ceiling/)).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(2));
    expect(savedInputs[1]!.selectedMainBasketIds).toEqual(["basket-pop"]);
    expect(savedInputs[1]!.lineItems.find(line => line.mainLineId === "line-paint"))
      .toMatchObject({ id: "saved-line-paint", included: false });
    view.unmount(); view = renderWorkspace();
    await screen.findByRole("button", { name: "Add False ceiling painting" });
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    await user.click(screen.getByRole("button", { name: "Add False ceiling painting" }));
    await expectRecommendationsCompleted();
    expect(selectedItem(/False ceiling painting/)).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Ceiling primer|Protective coating|Feature wall texture/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(3));
    expect(savedInputs[2]!.lineItems.filter(line => line.mainBasketId === "basket-paint"))
      .toEqual([expect.objectContaining({ id: "saved-line-paint", included: true })]);
  });

  it.each(["other room", "explicit setup"] as const)("preserves %s basket intent when removing the current room recommendation", async retainedBy => {
    const user = userEvent.setup();
    const base = savedConfiguredEstimate("rev-pop");
    const bedroomSource = { ...base.lineItems[0]!, id: "bed-source", roomId: "room-bed", roomName: "Bedroom 1" };
    const bedroomPaint = { ...bedroomSource, id: "bed-paint", catalogueId: "line-paint", mainLineId: "line-paint",
      mainLineName: "False ceiling painting", mainBasketId: "basket-paint", mainBasketName: "Painting",
      subBasketId: "sub-paint", subBasketName: "Ceiling finish", revisionId: "rev-paint", quantity: 3,
      ratePaise: 25000, rate: 250, amountPaise: 75000, amount: 750, recommendationSourceMainLineIds: ["line-pop"] };
    const saved = { ...base, status: "draft", selectedMainBasketIds: ["basket-pop", "basket-paint"],
      rooms: retainedBy === "other room" ? [...base.rooms, { ...base.rooms[0]!, id: "room-bed", label: "Bedroom 1", typeId: "bedroom_1" }] : base.rooms,
      lineItems: retainedBy === "other room" ? [...base.lineItems, bedroomSource, bedroomPaint] : base.lineItems };
    const { savedInputs } = installReads(false, saved, undefined, false, undefined, true);
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    await expectRecommendationsCompleted();
    await user.click(screen.getByRole("button", { name: "Recommendations (1)" }));
    await user.click(await screen.findByRole("button", { name: "Remove False ceiling painting" }));
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    if (retainedBy === "other room") {
      expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Bedroom 1/ }));
      await user.click(await screen.findByRole("button", { name: "Close recommendations" }));
      expect(screen.getByRole("region", { name: "Painting" })).toBeVisible();
      expect(selectedItem(/False ceiling painting/)).toBeChecked();
      expect(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ })).toHaveValue(3);
    } else {
      expect(screen.getByRole("region", { name: "Painting" })).toBeVisible();
      expect(selectedItem(/False ceiling painting/)).not.toBeChecked();
    }
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(1));
    expect(savedInputs[0]!.selectedMainBasketIds).toEqual(["basket-pop", "basket-paint"]);
    if (retainedBy === "other room") expect(savedInputs[0]!.lineItems.find(line => line.id === "bed-paint"))
      .toMatchObject({ roomId: "room-bed", included: true, quantity: 3, ratePaise: 25000 });
  });


  it("preserves explicit saved Setup scope after recommendation-only items are removed following a full reload", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, { ...savedConfiguredEstimate("rev-pop"), status: "draft",
      selectedMainBasketIds: ["basket-pop", "basket-paint"] }, undefined, false, undefined, true);
    let view = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add False ceiling painting" }));
    await expectRecommendationsCompleted();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    view.unmount(); view = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Remove False ceiling painting" }));
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(2));
    expect(savedInputs[1]!.selectedMainBasketIds).toEqual(["basket-pop", "basket-paint"]);
    expect(savedInputs[1]!.lineItems.find(line => line.mainLineId === "line-paint"))
      .toMatchObject({ id: "saved-line-paint", included: false });
    view.unmount(); view = renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Close recommendations" }));
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit baskets" }));
    expect(await screen.findByRole("button", { name: "Added Painting" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("region", { name: "Painting" })).toBeVisible();
    expect(selectedItem(/False ceiling painting/)).not.toBeChecked();
    expect(selectedItem(/Ceiling primer/)).not.toBeChecked();
  });

});
