import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  await user.click(screen.getByRole("option", { name: "Master Bedroom" }));
  await user.click(screen.getByRole("button", { name: "Done" }));
  await user.click(screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ }));
  for (const name of additionalBasketNames) await user.click(screen.getByRole("button", { name: `Add ${name}` }));
  await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
}

describe("estimator room recommendations", () => {
  const optionalRule = (target: "paint" | "light", requirement: "must" | "can" = "can"): EstimationRecommendationRule => ({
    id: `rule-${target}`, requirement, reason: `Consider ${target} for this source.`, targetKind: "main_line",
    targetBasketId: `basket-${target}`, targetSubBasketId: `sub-${target}`, targetMainLineId: `line-${target}`,
    targetRevisionId: `rev-${target}`, targetRevisionVersion: 1, targetItemVersion: 1, available: true, completionRequired: false
  });

  it("keeps an explicitly declined probable source, saves only included scope, and restores it on reload", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    const rendered = renderWorkspace();
    await openBuilder(user);
    const source = screen.getByRole("checkbox", { name: /Functional Lights/ });
    await user.click(source);
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: /Not necessary: False ceiling functional lights/ }));
    expect(within(dialog).getByText("All recommendations reviewed.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(source).toBeChecked();
    expect(screen.getByText("₹177 total")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /False ceiling functional lights/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs.at(-1)?.lineItems).toEqual([expect.objectContaining({ mainLineId: "line-functional", included: true, ratePaise: 15_000, recommendationSourceMainLineIds: [] })]);
    rendered.unmount();
    renderWorkspace();
    expect(await screen.findByRole("checkbox", { name: /Functional Lights/ })).toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("₹177 total")).toBeVisible();
  });

  it("lets manual review reconsider a declined probable item and adds it with its source origin", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace();
    await openBuilder(user);
    await user.click(screen.getByRole("checkbox", { name: /Functional Lights/ }));
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Not necessary:/ }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Review recommendations" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Not necessary:/ })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling functional lights for Living & Dining" }));
    await user.click(await within(dialog).findByRole("button", { name: "Done" }));
    expect(screen.getByRole("checkbox", { name: /False ceiling functional lights/ })).toBeChecked();
    expect(screen.getByText("₹590 total")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs.at(-1)?.lineItems.find((line) => line.mainLineId === "line-light"))
      .toMatchObject({ included: true, recommendationSourceMainLineIds: ["line-functional"] });
  });

  it.each([true, false])("requires an explicit response to every probable target before preserving a source: all answered %s", async (allAnswered) => {
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, false, (id) => id === "line-pop" ? [optionalRule("paint"), optionalRule("light")] : []);
    renderWorkspace();
    await openBuilder(user);
    const source = screen.getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(source);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Not necessary: False ceiling painting/ }));
    if (allAnswered) {
      await user.click(within(dialog).getByRole("button", { name: /Not necessary: False ceiling functional lights/ }));
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
    } else await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    if (allAnswered) expect(source).toBeChecked();
    else expect(source).not.toBeChecked();
    expect(screen.getByText(allAnswered ? "₹118 total" : "₹0 total")).toBeVisible();
  });

  it("does not let a probable skip satisfy an unanswered non-negotiable addition", async () => {
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, false, (id) => id === "line-pop" ? [optionalRule("paint", "must"), optionalRule("light")] : []);
    renderWorkspace();
    await openBuilder(user);
    const source = screen.getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(source);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /Not necessary:/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Next recommendation" }));
    await user.click(within(dialog).getByRole("button", { name: /Not necessary:/ }));
    expect(within(dialog).getByText("Non-Negotiable Addition")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Not necessary:/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(source).not.toBeChecked();
  });

  it("retains a prior optional skip when another optional item is added and sources reload", async () => {
    const user = userEvent.setup();
    installReads(false, null, undefined, false, undefined, false, (id) => id === "line-pop" ? [optionalRule("paint"), optionalRule("light")] : []);
    renderWorkspace();
    await openBuilder(user);
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Not necessary: False ceiling painting/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling functional lights for Living & Dining" }));
    await user.click(await within(dialog).findByRole("button", { name: "Done" }));
    expect(screen.getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /False ceiling functional lights/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    expect(screen.getByText("₹531 total")).toBeVisible();
  });

  it("invalidates declined targets on refresh when Configuration makes them required", async () => {
    const user = userEvent.setup();
    let requirement: "must" | "can" = "can";
    installReads(false, null, undefined, false, undefined, false, (id) => id === "line-pop" ? [optionalRule("paint", requirement), optionalRule("light")] : []);
    renderWorkspace();
    await openBuilder(user);
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Not necessary: False ceiling painting/ }));
    requirement = "must";
    fireEvent.click(screen.getByRole("button", { name: "Refresh available items" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Add False ceiling functional lights/ })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Next recommendation" }));
    expect(within(dialog).getByText("Non-Negotiable Addition")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Not necessary:/ })).not.toBeInTheDocument();
  });

  it("starts a fresh optional review when a source is deselected and selected again", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user);
    const source = screen.getByRole("checkbox", { name: /Functional Lights/ });
    await user.click(source);
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Not necessary:/ }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await user.click(source);
    await user.click(source);
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /Not necessary:/ })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(source).not.toBeChecked();
  });

  it("removes cascaded recommendations from Selected while an independent item remains", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user, ["Lights"]);
    await user.click(screen.getByRole("checkbox", { name: /False ceiling functional lights/ }));
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    const quantity = screen.getByRole("spinbutton", { name: /Quantity .* False ceiling painting/ });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.click(screen.getByRole("button", { name: "Selected (3)" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter Main Baskets" }), "basket-pop");
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(screen.getByRole("combobox", { name: "Filter Main Baskets" })).toHaveValue("all");
    expect(screen.getByRole("button", { name: "Selected (1)" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /False ceiling functional lights/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /POP false ceiling|False ceiling painting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Painting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "POP / Gypsum" })).not.toBeInTheDocument();
    expect(screen.getByText("₹413 total")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "By Section" }));
    expect(screen.getByRole("checkbox", { name: /False ceiling painting/ })).not.toBeChecked();
    expect(screen.getByRole("spinbutton", { name: /Quantity .* False ceiling painting/ })).toHaveValue(2);
  });

  it("removes only recommendation-added scope when its source is unchecked", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    const painting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    const paintCheckbox = within(painting).getByRole("checkbox", { name: /False ceiling painting/ });
    const paintingQuantity = within(painting).getByRole("spinbutton", { name: /Quantity .* False ceiling painting/ });
    await user.clear(paintingQuantity);
    await user.type(paintingQuantity, "2");
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    sourceCheckbox.focus();
    expect(sourceCheckbox).toHaveFocus();
    await user.keyboard(" ");

    expect(paintCheckbox).not.toBeChecked();
    expect(screen.getByText("₹0 total")).toBeVisible();
    expect(screen.getByText(/0 selected line items/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByRole("heading", { name: "Estimate summary" })).toBeVisible();
    expect(screen.getAllByText("0 selected items")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Proposal" }));
    expect(screen.queryByText("False ceiling painting")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Estimate Builder" }));
    const returnedPainting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(returnedPainting).getByRole("spinbutton", { name: /Quantity .* False ceiling painting/ })).toHaveValue(2);
    const manualPaintCheckbox = within(screen.getByRole("region", { name: "Painting" }))
      .getByRole("checkbox", { name: /False ceiling painting/ });
    const reselectedSourceCheckbox = within(screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement)
      .getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(manualPaintCheckbox);
    expect(manualPaintCheckbox).toBeChecked();
    await user.click(reselectedSourceCheckbox);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(reselectedSourceCheckbox);
    expect(manualPaintCheckbox).toBeChecked();
  });

  it("keeps a manually selected target after its recommending source is removed", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user, ["Painting"]);
    const painting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    const paintCheckbox = within(painting).getByRole("checkbox", { name: /False ceiling painting/ });
    await user.click(paintCheckbox);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const popCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(popCheckbox);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(popCheckbox);
    expect(paintCheckbox).toBeChecked();
    expect(screen.getByText("₹295 total")).toBeVisible();
  });

  it("keeps a shared target until both recorded sources are unchecked", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate, true);
    renderWorkspace();
    await openBuilder(user);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const functional = screen.getByText("Functional Lights").closest(".configured-estimate-line") as HTMLElement;
    const popCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    const functionalCheckbox = within(functional).getByRole("checkbox", { name: /Functional Lights/ });
    await user.click(popCheckbox);
    await user.click(functionalCheckbox);
    releaseRecommendation();
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    const painting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    const paintCheckbox = within(painting).getByRole("checkbox", { name: /False ceiling painting/ });
    await user.click(popCheckbox);
    expect(paintCheckbox).toBeChecked();
    await user.click(functionalCheckbox);
    expect(paintCheckbox).not.toBeChecked();
    expect(screen.getByText("₹0 total")).toBeVisible();
  });

  it("cleans related items when a Main Basket is deselected and keeps its revealed Basket", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    const popBasket = screen.getByRole("button", { name: /^(?:Add|Added) POP \/ Gypsum$/ });
    const paintingBasket = screen.getByRole("button", { name: /^(?:Add|Added) Painting$/ });
    await user.click(popBasket);
    expect(paintingBasket).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    const painting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(painting).getByRole("checkbox", { name: /False ceiling painting/ })).not.toBeChecked();
    expect(screen.getByText("₹0 total")).toBeVisible();
  });

  it("clears filtered and hidden baskets without writes, preserves saved and edited data, and clears recommendation inclusion when re-added", async () => {
    const user = userEvent.setup();
    const { savedInputs, requests } = installReads(false, null, undefined, false, undefined, true);
    renderWorkspace();
    await openBuilder(user);
    await user.click(screen.getByRole("checkbox", { name: /POP false ceiling/ }));
    let dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("checkbox", { name: /Functional Lights/ }));
    dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling functional lights for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    const source = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(source).getByRole("radio", { name: /Special item type/ }));
    await user.click(within(source).getByRole("radio", { name: /PMC pricing mode/ }));
    const sourceRate = within(source).getByRole("textbox", { name: /Selling rate/ });
    await user.clear(sourceRate);
    await user.type(sourceRate, "123.45");
    const sourceQuantity = within(source).getByRole("spinbutton", { name: /Quantity/ });
    await user.clear(sourceQuantity);
    await user.type(sourceQuantity, "2.5");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Estimate draft saved.");
    expect(savedInputs).toHaveLength(1);
    const firstSaved = savedInputs[0]!;
    expect(firstSaved.selectedMainBasketIds).toEqual(["basket-pop", "basket-paint", "basket-light"]);
    expect(firstSaved.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ mainLineId: "line-paint", included: true, recommendationSourceMainLineIds: ["line-pop"] }),
      expect.objectContaining({ mainLineId: "line-light", included: true, recommendationSourceMainLineIds: ["line-functional"] })
    ]));
    const persistedInputs = structuredClone(firstSaved);

    await user.clear(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ }), "4.75");
    const paintingRate = screen.getByRole("textbox", { name: /Selling rate.*False ceiling painting/ });
    await user.clear(paintingRate);
    await user.type(paintingRate, "287.65");
    const paintingQuantity = screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ });
    await user.clear(paintingQuantity);
    await user.type(paintingQuantity, "3.25");
    await user.click(screen.getByRole("button", { name: "Back to Asha Shah" }));
    expect(screen.getByRole("region", { name: /Living & Dining dimensions/ })).toBeVisible();
    expect(screen.getByRole("region", { name: /Master Bedroom dimensions/ })).toBeVisible();
    const search = screen.getByRole("searchbox", { name: "Search baskets" });
    await user.type(search, "pop");
    expect(screen.getByRole("button", { name: "Added POP / Gypsum" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("article", { name: "Painting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Lights" })).not.toBeInTheDocument();
    const selection = screen.getByRole("region", { name: "Basket selection" });
    expect(within(selection).getByRole("status")).toHaveTextContent("3 selected");
    const beforeClear = requests.slice();
    const clearAll = within(selection).getByRole("button", { name: "Clear all" });
    clearAll.focus();
    await user.keyboard("{Enter}");
    expect(within(selection).getByRole("status")).toHaveTextContent("0 selected");
    expect(clearAll).toBeDisabled();
    expect(within(selection).getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add POP / Gypsum" })).toHaveAttribute("aria-pressed", "false");
    expect(search).toHaveValue("pop");
    expect(requests).toEqual(beforeClear);
    expect(savedInputs).toEqual([persistedInputs]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    for (const name of ["POP / Gypsum", "Painting", "Lights"]) {
      const add = screen.getByRole("button", { name: `Add ${name}` });
      expect(add).toHaveAttribute("aria-pressed", "false");
      await user.click(add);
    }
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    for (const name of [/POP false ceiling/, /Functional Lights/, /False ceiling painting/, /False ceiling functional lights/]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recommendations for this room" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /Quantity.*POP false ceiling/ })).toHaveValue(4.75);
    expect(screen.getByRole("textbox", { name: /Selling rate.*POP false ceiling/ })).toHaveValue("123.45");
    expect(screen.getByRole("spinbutton", { name: /Quantity.*False ceiling painting/ })).toHaveValue(3.25);
    expect(screen.getByRole("textbox", { name: /Selling rate.*False ceiling painting/ })).toHaveValue("287.65");
    expect(screen.getByRole("navigation", { name: "Rooms" })).toHaveTextContent("Master Bedroom");
    expect(screen.getByRole("navigation", { name: "Rooms" })).toHaveTextContent("Living & Dining");
    expect(savedInputs).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(2));
    const cleared = savedInputs[1]!;
    expect(cleared.rooms).toEqual(firstSaved.rooms);
    expect(cleared.lineItems).toHaveLength(4);
    expect(cleared.lineItems.every((line) => !line.included && line.recommendationSourceMainLineIds?.length === 0)).toBe(true);
    expect(cleared.lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "saved-line-pop", mainLineId: "line-pop", quantity: 4.75, ratePaise: 12345, classification: "special", pricingMode: "pmc", rateSource: "manual" }),
      expect.objectContaining({ id: "saved-line-paint", mainLineId: "line-paint", quantity: 3.25, ratePaise: 28765, rateSource: "manual" }),
      expect.objectContaining({ id: "saved-line-functional", mainLineId: "line-functional" }),
      expect.objectContaining({ id: "saved-line-light", mainLineId: "line-light" })
    ]));
    expect(firstSaved).toEqual(persistedInputs);
  });

  it("restores a previously selected mode on recommendation inclusion, saves origin and manual pricing, and restores both", async () => {
    const user = userEvent.setup();
    const { savedInputs } = installReads(false, null, undefined, false, undefined, true);
    const view = renderWorkspace();
    await openBuilder(user, ["Painting"]);
    const initialPainting = screen.getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(initialPainting).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("250");
    expect(within(initialPainting).queryByRole("group", { name: /Item type|Pricing mode/ })).not.toBeInTheDocument();
    await user.click(within(initialPainting).getByRole("checkbox"));
    await user.click(within(initialPainting).getByRole("radio", { name: /Special item type/ }));
    await user.click(within(initialPainting).getByRole("radio", { name: /PMC pricing mode/ }));
    const paintingRate = within(initialPainting).getByRole("textbox", { name: /Selling rate/ });
    expect(paintingRate).toHaveValue("80");
    await user.clear(paintingRate);
    await user.type(paintingRate, "91.17");
    await user.click(within(initialPainting).getByRole("checkbox"));
    expect(within(initialPainting).getByRole("checkbox")).not.toBeChecked();
    expect(within(initialPainting).queryByRole("group", { name: /Item type|Pricing mode/ })).not.toBeInTheDocument();
    expect(screen.getByText("₹0 total")).toBeVisible();
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(within(initialPainting).getByRole("radio", { name: /PMC pricing mode/ })).toBeChecked();
    expect(paintingRate).toHaveValue("91.17");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Estimate draft saved.")).toBeVisible();
    expect(savedInputs[0]?.lineItems.find((line) => line.mainLineId === "line-paint"))
      .toMatchObject({ included: true, recommendationSourceMainLineIds: ["line-pop"], pricingMode: "pmc", rateSource: "manual", ratePaise: 9117 });

    view.unmount();
    renderWorkspace();
    const restoredAdvice = await screen.findByRole("region", { name: "Recommendations for this room" });
    await within(restoredAdvice).findByText("All related items selected.");
    const restoredPop = await screen.findByText("POP false ceiling");
    const popCheckbox = within(restoredPop.closest(".configured-estimate-line") as HTMLElement)
      .getByRole("checkbox", { name: /POP false ceiling/ });
    const painting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(painting).getByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(within(painting).getByRole("textbox", { name: /Selling rate/ })).toHaveValue("91.17");
    expect(within(painting).getByRole("radio", { name: /PMC pricing mode/ })).toBeChecked();
    expect(popCheckbox).toBeChecked();
    expect(popCheckbox).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(popCheckbox);
    await waitFor(() => expect(within(screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement)
      .getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked());
    expect(within(screen.getByRole("region", { name: "Painting" }))
      .getByRole("checkbox", { name: /False ceiling painting/ })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(savedInputs).toHaveLength(2));
    expect(savedInputs[1]?.lineItems.find((line) => line.mainLineId === "line-paint"))
      .toMatchObject({ included: false, recommendationSourceMainLineIds: [], pricingMode: "pmc", rateSource: "manual", ratePaise: 9117 });
  });

  it.each(["Not now", "Escape", "X", "Backdrop"])("unchecks only the new source after an automatic %s dismissal without a related selection", async (dismissal) => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(dialog).toHaveClass("ui-dialog", "modal");
    expect(dialog.parentElement).toHaveClass("modal-layer");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("₹118 total")).toBeVisible();
    expect(within(dialog).getByText(/Closing without adding a related item will uncheck/)).toBeVisible();

    if (dismissal === "Escape") await user.keyboard("{Escape}");
    else if (dismissal === "Backdrop") await user.click(document.querySelector(".modal-backdrop") as HTMLElement);
    else if (dismissal === "X") await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    else await user.click(within(dialog).getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(sourceCheckbox).not.toBeChecked());
    expect(screen.getByText("₹0 total")).toBeVisible();
    expect(screen.getByText("Removed POP false ceiling from Living & Dining because no related item was selected.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Recommendations for this room" })).not.toBeInTheDocument();
    await waitFor(() => expect(sourceCheckbox).toHaveFocus());
  });

  it("clears an earlier rollback notice when the source is checked again and a target is selected", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    const firstModal = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(firstModal).getByRole("button", { name: "Not now" }));
    expect(await screen.findByText("Removed POP false ceiling from Living & Dining because no related item was selected.")).toBeVisible();

    await user.click(sourceCheckbox);
    expect(screen.queryByText("Removed POP false ceiling from Living & Dining because no related item was selected.")).not.toBeInTheDocument();
    const secondModal = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(secondModal).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(secondModal).getByRole("button", { name: "Done" }));
    expect(sourceCheckbox).toBeChecked();
    expect(screen.getByText("₹413 total")).toBeVisible();
    expect(screen.queryByText("Removed POP false ceiling from Living & Dining because no related item was selected.")).not.toBeInTheDocument();
  });

  it("does not open delayed advice or roll back a checked line after saving starts", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    let releaseSave!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    installReads(false, null, recommendationGate, false, saveGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    releaseRecommendation();
    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    await within(alert).findByRole("heading", { name: "False ceiling painting is needed for POP false ceiling." });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sourceCheckbox).toBeChecked();

    releaseSave();
    expect(await screen.findByText("Estimate draft saved.")).toBeVisible();
    expect(sourceCheckbox).toBeChecked();
    expect(screen.getByText("₹118 total")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes an automatic modal without rollback when saving begins", async () => {
    const user = userEvent.setup();
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    installReads(false, null, undefined, false, saveGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    expect(await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sourceCheckbox).toBeChecked();
    expect(screen.getByText("₹118 total")).toBeVisible();

    releaseSave();
    expect(await screen.findByText("Estimate draft saved.")).toBeVisible();
    expect(sourceCheckbox).toBeChecked();
  });

  it("counts a guarded selection even when the modal closes before its state has rendered", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    act(() => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    });

    expect(sourceCheckbox).toBeChecked();
    expect(await screen.findByText("₹413 total")).toBeVisible();
    const paint = within(screen.getByRole("region", { name: "Painting" })).getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(paint).getByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(screen.queryByText(/Removed POP false ceiling/)).not.toBeInTheDocument();
  });

  it("rolls back only the unsatisfied source when two sources opened one modal", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const functional = screen.getByText("Functional Lights").closest(".configured-estimate-line") as HTMLElement;
    const popCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    const functionalCheckbox = within(functional).getByRole("checkbox", { name: /Functional Lights/ });
    await user.click(popCheckbox);
    await user.click(functionalCheckbox);
    releaseRecommendation();
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));

    expect(popCheckbox).toBeChecked();
    await waitFor(() => expect(functionalCheckbox).not.toBeChecked());
    expect(screen.getByText("₹413 total")).toBeVisible();
    expect(screen.getByText("Removed Functional Lights from Living & Dining because no related item was selected.")).toBeVisible();
  });

  it("lets one selected target satisfy two newly checked sources that share it", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate, true);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const functional = screen.getByText("Functional Lights").closest(".configured-estimate-line") as HTMLElement;
    const popCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    const functionalCheckbox = within(functional).getByRole("checkbox", { name: /Functional Lights/ });
    await user.click(popCheckbox);
    await user.click(functionalCheckbox);
    releaseRecommendation();
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(within(dialog).getAllByRole("button", { name: "Add False ceiling painting for Living & Dining" })).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    expect(popCheckbox).toBeChecked();
    expect(functionalCheckbox).toBeChecked();
    expect(screen.getByText("₹590 total")).toBeVisible();
    expect(screen.queryByText(/Removed .* because no related item was selected/)).not.toBeInTheDocument();
  });

  it("does not roll back a newly checked source with no actionable advice in the same batch", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate);
    renderWorkspace();
    await openBuilder(user, ["Lights"]);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const light = screen.getByText("False ceiling functional lights").closest(".configured-estimate-line") as HTMLElement;
    const popCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    const lightCheckbox = within(light).getByRole("checkbox", { name: /False ceiling functional lights/ });
    await user.click(popCheckbox);
    await user.click(lightCheckbox);
    releaseRecommendation();
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));

    await waitFor(() => expect(popCheckbox).not.toBeChecked());
    expect(lightCheckbox).toBeChecked();
    expect(screen.getByText("₹413 total")).toBeVisible();
  });

  it("keeps an unrelated line in another room when automatic dismissal unchecks the new source", async () => {
    const user = userEvent.setup();
    installReads();
    renderWorkspace();
    await openBuilder(user, ["Painting"]);

    const rooms = screen.getByRole("navigation", { name: "Rooms" });
    await user.click(within(rooms).getByRole("button", { name: /Master Bedroom/ }));
    const masterPainting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(masterPainting).getByRole("checkbox", { name: /False ceiling painting/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(rooms).getByRole("button", { name: /Living & Dining/ }));
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(sourceCheckbox).not.toBeChecked());

    await user.click(within(rooms).getByRole("button", { name: /Master Bedroom/ }));
    const remainingPainting = within(screen.getByRole("region", { name: "Painting" }))
      .getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(remainingPainting).getByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
  });

  it("explains configured relationships and includes only the explicitly chosen target in the active room", async () => {
    const user = userEvent.setup();
    const { calls } = installReads();
    renderWorkspace();
    await openBuilder(user);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(await within(dialog).findByText("Painting completes the ceiling surface.")).toBeVisible();
    expect(within(dialog).getByText("False ceiling painting is needed for POP false ceiling.")).toBeVisible();
    expect(screen.getByText("₹118 total")).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: /False ceiling painting/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" }));
    expect(await screen.findByText("₹413 total")).toBeVisible();
    expect(await within(dialog).findByText("All related items selected.")).toBeVisible();
    expect(calls.some((ids) => ids.includes("line-pop"))).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const paint = within(screen.getByRole("region", { name: "Painting" })).getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(paint).getByRole("checkbox", { name: /False ceiling painting/ })).toBeChecked();
    expect(within(screen.getByRole("navigation", { name: "Jump to Main Basket" })).getByRole("button", { name: /Painting/ })).toBeVisible();
    const alert = screen.getByRole("region", { name: "Recommendations for this room" });
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    expect(await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close recommendations" }));

    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Master Bedroom/ }));
    const masterPaint = within(screen.getByRole("region", { name: "Painting" })).getByText("False ceiling painting").closest(".configured-estimate-line") as HTMLElement;
    expect(within(masterPaint).getByRole("checkbox", { name: /False ceiling painting/ })).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "Recommendations for this room" })).not.toBeInTheDocument();

    const functional = screen.getByText("Functional Lights").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(functional).getByRole("checkbox", { name: /Functional Lights/ }));
    const masterDialog = await screen.findByRole("dialog", { name: "Recommendations for Master Bedroom" });
    expect(await within(masterDialog).findByText("Provide fittings at the ceiling openings.")).toBeVisible();
    expect(within(masterDialog).getByText("Consider False ceiling functional lights for Functional Lights.")).toBeVisible();
    expect(within(masterDialog).getByRole("button", { name: "Add False ceiling functional lights for Master Bedroom" })).toBeEnabled();
  });

  it("keeps a failed recommendation read distinct from an empty result and retries it", async () => {
    const user = userEvent.setup();
    installReads(true);
    renderWorkspace();
    await openBuilder(user);
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Recommendations could not be loaded");
    expect(within(dialog).queryByText("No configured recommendations for the selected items in this room.")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    expect(within(pop).getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    const retryDialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    await user.click(within(retryDialog).getByRole("button", { name: "Retry recommendations" }));
    await waitFor(() => expect(within(retryDialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" })).toBeEnabled());
    await user.click(within(retryDialog).getByRole("button", { name: "Not now" }));
    expect(within(pop).getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
  });

  it("shows current advice for a matching persisted read-only line without a Select action", async () => {
    const { calls } = installReads(false, savedConfiguredEstimate("rev-pop"));
    renderWorkspace();
    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(await within(dialog).findByText("Painting completes the ceiling surface.")).toBeVisible();
    expect(within(dialog).getByText("This estimate is read-only. Related items are shown for review.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Add False ceiling painting for Living & Dining" })).toBeDisabled();
    expect(calls).toEqual([["line-pop"]]);
  });

  it("explains a historical saved source without querying current rules or asking for futile refresh", async () => {
    const { calls } = installReads(false, savedConfiguredEstimate("rev-pop-old"));
    renderWorkspace();
    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    const user = userEvent.setup();
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(await within(dialog).findByText(/Current advice is unavailable for these saved lines/)).toBeVisible();
    expect(within(dialog).getByText("POP false ceiling")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Refresh available items" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Add recommended item/ })).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("waits for the latest combined response and opens once for multiple newly selected sources", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    const { calls } = installReads(false, null, recommendationGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const functional = screen.getByText("Functional Lights").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(functional).getByRole("checkbox", { name: /Functional Lights/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    releaseRecommendation();
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(within(dialog).getByText("Painting completes the ceiling surface.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Next recommendation" }));
    expect(within(dialog).getByText("Provide fittings at the ceiling openings.")).toBeVisible();
    expect(calls.some((ids) => ids.includes("line-pop") && ids.includes("line-functional"))).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(pop).getByRole("checkbox", { name: /POP false ceiling/ })).not.toBeChecked();
    expect(within(functional).getByRole("checkbox", { name: /Functional Lights/ })).not.toBeChecked();
    expect(screen.getByText("₹0 total")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Recommendations for this room" })).not.toBeInTheDocument();
  });

  it("cancels a pending opening when the room changes before recommendations arrive", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Master Bedroom/ }));
    releaseRecommendation();
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Living & Dining/ }));
    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    await waitFor(() => expect(within(alert).getByRole("button", { name: "Review recommendations" })).toBeEnabled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels a pending opening when the source is removed before advice arrives", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    await user.click(sourceCheckbox);
    releaseRecommendation();
    expect(sourceCheckbox).not.toBeChecked();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Recommendations for this room" })).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("honors a manual dismissal while recommendations are still loading", async () => {
    const user = userEvent.setup();
    let releaseRecommendation!: () => void;
    const recommendationGate = new Promise<void>((resolve) => { releaseRecommendation = resolve; });
    installReads(false, null, recommendationGate);
    renderWorkspace();
    await openBuilder(user);

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    const dialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Checking configured recommendations");
    await user.click(within(dialog).getByRole("button", { name: "Close recommendations" }));
    releaseRecommendation();
    await within(alert).findByRole("heading", { name: "False ceiling painting is needed for POP false ceiling." });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not auto-open for a source whose related item is already included", async () => {
    const user = userEvent.setup();
    const savedDraft = savedConfiguredEstimate("rev-pop");
    const popLine = savedDraft.lineItems[0]!;
    const paintLine = {
      ...popLine, id: "saved-paint", catalogueId: "line-paint", mainBasketId: "basket-paint", mainBasketName: "Painting",
      subBasketId: "sub-paint", subBasketName: "Ceiling finish", mainLineId: "line-paint",
      mainLineName: "False ceiling painting", revisionId: "rev-paint", sourceItemVersion: 1, sourceRevisionVersion: 1,
      rate: 250, ratePaise: 25_000, amount: 250, amountPaise: 25_000
    };
    installReads(false, { ...savedDraft, status: "draft", selectedMainBasketIds: ["basket-pop", "basket-paint"], lineItems: [popLine, paintLine] });
    renderWorkspace();

    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    await within(alert).findByText("All related items selected.");
    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    const sourceCheckbox = within(pop).getByRole("checkbox", { name: /POP false ceiling/ });
    await user.click(sourceCheckbox);
    await user.click(sourceCheckbox);
    const restoredAlert = await screen.findByRole("region", { name: "Recommendations for this room" });
    await within(restoredAlert).findByText("All related items selected.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not auto-open restored drafts and reopens from the alert or a fresh cached inclusion", async () => {
    const user = userEvent.setup();
    const savedDraft = { ...savedConfiguredEstimate("rev-pop"), status: "draft" };
    const { calls } = installReads(false, savedDraft);
    renderWorkspace();

    const alert = await screen.findByRole("region", { name: "Recommendations for this room" });
    await waitFor(() => expect(within(alert).getByRole("button", { name: "Review recommendations" })).toBeEnabled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Review recommendations" }));
    const restoredDialog = await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" });
    expect(restoredDialog).toHaveClass("ui-dialog", "modal");
    expect(await within(restoredDialog).findByText("Painting completes the ceiling surface.")).toBeVisible();
    expect(within(restoredDialog).queryByText(/Closing without adding a related item will uncheck/)).not.toBeInTheDocument();
    await user.click(within(restoredDialog).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(within(alert).getByRole("button", { name: "Review recommendations" })).toHaveFocus());

    const pop = screen.getByText("POP false ceiling").closest(".configured-estimate-line") as HTMLElement;
    expect(within(pop).getByRole("checkbox", { name: /POP false ceiling/ })).toBeChecked();
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    await user.click(within(pop).getByRole("checkbox", { name: /POP false ceiling/ }));
    expect(await screen.findByRole("dialog", { name: "Recommendations for Living & Dining" })).toBeVisible();
    expect(calls.filter((ids) => ids.includes("line-pop"))).toHaveLength(1);
  });
});
