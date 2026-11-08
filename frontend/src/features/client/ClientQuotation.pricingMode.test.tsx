import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ClientQuotation } from "./ClientQuotation";
import type { QuotationCandidate, QuotationDetail, QuotationOperation, QuotationPricingModeChoice } from "./quotationApi";

const source = { revisionId: "revision-one", itemVersion: 2, revisionVersion: 3, uomId: "unit" };
const modeChoices: QuotationPricingModeChoice[] = [
  { pricingMode: "sub_vendor", choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: 50000, amountPaise: 100000, source }] },
  { pricingMode: "pmc", choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: 25000, amountPaise: 50000, source }] },
  { pricingMode: "in_house", choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: null, amountPaise: null, source,
    inHouseComponents: [{ id: "finish", label: "Finish", ratePaise: 15000, available: true }] }] }
];

function quotation(phase: QuotationDetail["phase"] = "pre"): QuotationDetail {
  return {
    projectId: "mode-project", estimateId: "mode-estimate", estimateVersion: 7, workflowVersion: 3, pricedRevision: 2,
    phase, status: "draft", reviewState: "draft", editingAllowed: true, editingBlockReason: null, canChangePricingMode: true,
    totalPaise: 100000, isIncomplete: false, rooms: [{ id: "living", name: "Living Room" }, { id: "bedroom", name: "Bedroom" }],
    baskets: [{ id: "furniture", name: "Furniture", subBaskets: [] }],
    lines: [{ id: "storage-living", mainLineId: "storage", mainLineName: "Storage", roomId: "living", roomName: "Living Room", included: true, source,
      mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: null, subBasketName: null, classification: "special",
      quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 50000, amountPaise: 100000,
      choices: structuredClone(modeChoices[0]!.choices), pricingModeChoices: structuredClone(modeChoices) }]
  };
}

function setup(initial = quotation(), options: { readOnly?: boolean; candidate?: QuotationCandidate; lostWrongMode?: boolean } = {}) {
  const state = { detail: initial };
  const saves: Array<{ expectedVersion: number; operations: QuotationOperation[] }> = [];
  server.use(
    http.get("/api/v1/projects/mode-project/quotation", () => HttpResponse.json({ data: state.detail })),
    http.get("/api/v1/projects/mode-project/quotation/revision", () => HttpResponse.json({ data: {
      estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion, pricedRevision: state.detail.pricedRevision,
      status: state.detail.status, phase: state.detail.phase
    } })),
    http.get("/api/v1/projects/mode-project/quotation/setup", () => HttpResponse.json({ data: {
      projectId: state.detail.projectId, estimateId: state.detail.estimateId, estimateVersion: state.detail.estimateVersion,
      setup: { propertyType: "1BHK", bedroomCount: null, rooms: [], selectedMainBasketIds: ["furniture"], sourceToken: "scope", canConfigure: false },
      baskets: [{ id: "furniture", name: "Furniture", subBaskets: [], canSelect: true, canRemove: true, removalBlockedReason: null, directTemporaryItemCount: 0 }]
    } })),
    http.get("/api/v1/projects/mode-project/quotation/items", () => HttpResponse.json({ data: {
      items: options.candidate ? [options.candidate] : [], total: options.candidate ? 1 : 0, limit: 20, offset: 0
    } })),
    http.post("/api/v1/projects/mode-project/quotation/recommendations/query", async ({ request }) => {
      const body = await request.json() as { roomId: string };
      return HttpResponse.json({ data: { projectId: state.detail.projectId, estimateId: state.detail.estimateId,
        estimateVersion: state.detail.estimateVersion, roomId: body.roomId, items: [], total: 0, limit: 20, offset: 0 } });
    }),
    http.patch("/api/v1/projects/mode-project/quotation", async ({ request }) => {
      const body = await request.json() as { expectedVersion: number; operations: QuotationOperation[] };
      saves.push(body);
      const next = structuredClone(state.detail);
      if (!options.lostWrongMode) for (const operation of body.operations) {
        if (operation.kind !== "update" && operation.kind !== "add") continue;
        let line = operation.kind === "update" ? next.lines.find(line => line.id === operation.lineItemId) : undefined;
        if (!line && operation.kind === "add" && options.candidate) {
          line = { ...next.lines[0]!, id: "new-line", mainLineId: operation.mainLineId, mainLineName: options.candidate.name,
            roomId: operation.roomId, quantity: operation.quantity, pricingModeChoices: options.candidate.pricingModeChoices };
          next.lines.push(line);
        }
        if (!line) continue;
        line.pricingMode = operation.pricingMode ?? line.pricingMode;
        line.modeTier = operation.modeTier ?? line.modeTier;
        line.quantity = operation.quantity ?? line.quantity;
        line.selectedInHouseComponentIds = operation.selectedInHouseComponentIds;
        line.choices = line.pricingModeChoices!.find(choice => choice.pricingMode === line.pricingMode)!.choices;
        line.ratePaise = line.choices[0]!.ratePaise;
        line.amountPaise = line.ratePaise === null ? null : line.ratePaise * line.quantity;
      }
      next.estimateVersion = next.estimateVersion! + 1;
      next.pricedRevision++;
      next.reviewState = "awaiting_staff_review";
      state.detail = next;
      return options.lostWrongMode ? HttpResponse.json({ error: { message: "Response lost" } }, { status: 503 }) : HttpResponse.json({ data: next });
    })
  );
  return { ...renderWithQuery(<ClientQuotation projectId="mode-project" readOnly={options.readOnly} />), state, saves };
}

const toggleName = "PMC pricing mode for Storage in Living Room";

describe("Client quotation pricing modes", () => {
  it("keeps keyboard order aligned with the reference row and leaves Client type and rate read-only", async () => {
    const user = userEvent.setup();
    const { saves } = setup();
    const row = await screen.findByRole("group", { name: "Storage Living Room" });
    expect(within(row).getByText("Special")).toBeVisible();
    expect(within(row).queryByRole("radio", { name: /(?:Standard|Special)/ })).not.toBeInTheDocument();
    expect(within(row).getByText("Rate (₹/Unit)")).toBeVisible();
    expect(within(row).getAllByRole("spinbutton")).toHaveLength(1);
    within(row).getByRole("checkbox", { name: "Include Storage in Living Room" }).focus();
    await user.tab();
    expect(within(row).queryByRole("radio", { name: /tier/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("switch", { name: toggleName })).toHaveFocus();
    await user.tab();
    expect(within(row).getByRole("radio", { name: "Sub-Vendor pricing mode for Storage in Living Room" })).toHaveFocus();
    await user.tab();
    expect(within(row).getByRole("button", { name: "Decrease quantity for Storage in Living Room" })).toHaveFocus();
    expect(saves).toEqual([]);
  });

  it.each(["pre", "post"] as const)("saves and reloads an explicit mode in the %s phase without changing quantity or showing reference prices", async phase => {
    const user = userEvent.setup();
    const { state, saves, container } = setup(quotation(phase));
    const toggle = await screen.findByRole("switch", { name: toggleName });
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toBeChecked();
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole("radio", { name: /Sub-Vendor pricing mode/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Configured price for Storage in Living Room" })).toHaveTextContent("₹250.00");
    expect(screen.getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,000.00");
    expect(screen.queryByText(/Configured price:|Base price:/)).not.toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toEqual({ expectedVersion: 7, operations: [{ kind: "update", lineItemId: "storage-living", included: true, source, quantity: 2, modeTier: "signature", pricingMode: "pmc" }] });
    await screen.findByText("Changes saved. Your team will review the revised quotation before approval.");
    expect(state.detail.lines[0]!.pricingMode).toBe("pmc");
    expect(screen.getByRole("switch", { name: toggleName })).toBeChecked();
    expect(screen.getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹500.00");
  });

  it("remembers non-PMC selection across room changes without sharing modes or stale component selections", async () => {
    const user = userEvent.setup(); const value = quotation();
    value.lines.push({ ...structuredClone(value.lines[0]!), id: "storage-bedroom", roomId: "bedroom", roomName: "Bedroom", pricingMode: "pmc", choices: structuredClone(modeChoices[1]!.choices) });
    const { saves } = setup(value);
    await user.click(await screen.findByRole("radio", { name: "In-house pricing mode for Storage in Living Room" }));
    await user.click(screen.getByRole("checkbox", { name: "Finish" }));
    await user.click(screen.getByRole("switch", { name: toggleName }));
    await user.click(screen.getByRole("button", { name: /Bedroom/ }));
    await user.click(screen.getByRole("switch", { name: "PMC pricing mode for Storage in Bedroom" }));
    expect(screen.getByRole("radio", { name: "Sub-Vendor pricing mode for Storage in Bedroom" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /Living Room/ }));
    await user.click(screen.getByRole("switch", { name: toggleName }));
    expect(screen.getByRole("radio", { name: "In-house pricing mode for Storage in Living Room" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Finish" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Select available components");
    expect(saves).toEqual([]);
  });

  it("clears remembered non-PMC modes on discard and defaults a fresh saved PMC row to Sub-Vendor", async () => {
    const user = userEvent.setup(); const value = quotation();
    value.lines[0] = { ...value.lines[0]!, pricingMode: "pmc", choices: structuredClone(modeChoices[1]!.choices) };
    setup(value);
    await user.click(await screen.findByRole("switch", { name: toggleName }));
    expect(screen.getByRole("radio", { name: "Sub-Vendor pricing mode for Storage in Living Room" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "In-house pricing mode for Storage in Living Room" }));
    await user.click(screen.getByRole("switch", { name: toggleName }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("switch", { name: toggleName })).toBeChecked();
    await user.click(screen.getByRole("switch", { name: toggleName }));
    expect(screen.getByRole("radio", { name: "Sub-Vendor pricing mode for Storage in Living Room" })).toBeChecked();
  });

  it.each(["missing-capability", "denied", "standard", "read-only", "missing-choices", "missing-classification"])("omits the static Vendor summary without granting control for %s", async scenario => {
    const value = quotation();
    if (scenario === "missing-capability") delete value.canChangePricingMode;
    if (scenario === "denied") value.canChangePricingMode = false;
    if (scenario === "standard") value.lines[0]!.classification = "standard";
    if (scenario === "missing-choices") delete value.lines[0]!.pricingModeChoices;
    if (scenario === "missing-classification") delete value.lines[0]!.classification;
    const { saves } = setup(value, { readOnly: scenario === "read-only" });
    const row = await screen.findByRole("group", { name: "Storage Living Room" });
    expect(within(row).queryByText("Vendor")).not.toBeInTheDocument();
    expect(within(row).queryByText("Pricing")).not.toBeInTheDocument();
    expect(within(row).getByText(scenario === "missing-classification" ? "Not recorded" : scenario === "standard" ? "Standard" : "Special")).toBeVisible();
    expect(within(row).queryByRole("switch")).not.toBeInTheDocument();
    expect(saves).toEqual([]);
  });

  it("keeps the compact component list contextual, removes unavailable selections, and saves component IDs", async () => {
    const user = userEvent.setup();
    const value = quotation();
    const inHouseChoices = structuredClone(modeChoices[2]!.choices);
    inHouseChoices[0]!.inHouseComponents!.push(
      { id: "retired-finish", label: "Retired finish", ratePaise: null, available: false },
      { id: "missing-panel", label: "Missing panel", ratePaise: null, available: false }
    );
    value.lines[0] = { ...value.lines[0]!, pricingMode: "in_house", choices: inHouseChoices,
      selectedInHouseComponentIds: ["retired-finish"],
      pricingModeChoices: [...structuredClone(modeChoices.slice(0, 2)), { pricingMode: "in_house", choices: inHouseChoices }] };
    const { saves, container } = setup(value);
    const components = await screen.findByRole("group", { name: "Components for Storage in Living Room" });
    expect(within(components).getByText("In-house components")).toBeVisible();
    const retired = within(components).getByRole("checkbox", { name: "Retired finish (unavailable)" });
    expect(retired).toBeChecked();
    expect(retired).toBeEnabled();
    expect(within(components).getByRole("checkbox", { name: "Missing panel (unavailable)" })).toBeDisabled();
    retired.focus();
    await user.keyboard(" ");
    expect(retired).not.toBeChecked();
    expect(retired).toBeDisabled();
    const finish = within(components).getByRole("checkbox", { name: "Finish" });
    finish.focus();
    await user.keyboard(" ");
    expect(finish).toBeChecked();
    expect(finish).toHaveFocus();
    expect(screen.getByRole("status", { name: "Configured price for Storage in Living Room" })).toHaveTextContent("From components");
    expect(screen.getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,000.00");
    expect(screen.queryByRole("button", { name: /Retry calculation|Use calculated rate/ })).not.toBeInTheDocument();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.operations).toEqual([{ kind: "update", lineItemId: "storage-living", included: true, source,
      quantity: 2, modeTier: "signature", selectedInHouseComponentIds: ["finish"] }]);
  });

  it("keeps the compact In-house list and selected components read-only when editing is unavailable", async () => {
    const value = quotation();
    value.lines[0] = { ...value.lines[0]!, pricingMode: "in_house", choices: structuredClone(modeChoices[2]!.choices), selectedInHouseComponentIds: ["finish"] };
    const { saves } = setup(value, { readOnly: true });
    const row = await screen.findByRole("group", { name: "Storage Living Room" });
    expect(within(row).getByText("In-house")).toBeVisible();
    const components = within(row).getByRole("group", { name: "Components for Storage in Living Room" });
    expect(within(components).getByText("In-house components")).toBeVisible();
    expect(within(components).getByRole("checkbox", { name: "Finish" })).toBeChecked();
    expect(within(components).getByRole("checkbox", { name: "Finish" })).toBeDisabled();
    expect(within(row).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(row).getByRole("status", { name: "Saved amount for Storage in Living Room" })).toHaveTextContent("₹1,000.00");
    expect(saves).toEqual([]);
  });

  it("shows unavailable pricing and preserves the draft instead of borrowing the saved rate", async () => {
    const user = userEvent.setup(); const value = quotation();
    value.lines[0]!.pricingModeChoices![1]!.choices[0] = { ...modeChoices[1]!.choices[0]!, available: false, unavailableReason: "PMC price is unavailable.", ratePaise: null, amountPaise: null };
    const { saves } = setup(value);
    await user.click(await screen.findByRole("switch", { name: toggleName }));
    expect(screen.getByRole("status", { name: "Configured price for Storage in Living Room" })).toHaveTextContent("Unavailable");
    expect(screen.getByText("PMC price is unavailable.")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Signature tier for Direct items in Furniture, Living Room" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh the configured options for Storage");
    expect(screen.getByRole("switch", { name: toggleName })).toBeChecked();
    expect(saves).toEqual([]);
  });

  it("adds only the selected item when its alternate mode is priced and saves the explicit choice", async () => {
    const user = userEvent.setup();
    const choices = [{ ...modeChoices[0]!.choices[0]!, available: false, unavailableReason: "Sub-Vendor price is unavailable.", ratePaise: null, amountPaise: null }];
    const candidate: QuotationCandidate = { mainLineId: "desk", name: "Desk", source, classification: "special", pricingMode: "sub_vendor", modeTier: "signature",
      mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: null, subBasketName: null,
      dimensionsMandatory: false, dimensionRule: null, uomName: "Unit", choices,
      pricingModeChoices: [{ pricingMode: "sub_vendor", choices }, ...structuredClone(modeChoices.slice(1))] };
    const { saves } = setup(quotation(), { candidate });
    await user.click(await screen.findByRole("button", { name: "Add items" }));
    await user.click(await screen.findByRole("button", { name: "Add Desk" }));
    expect(screen.getByText("Sub-Vendor price is unavailable.")).toBeVisible();
    expect(screen.getByRole("status", { name: "Amount for Desk in Living Room" })).toHaveTextContent("After save");
    await user.click(screen.getByRole("switch", { name: "PMC pricing mode for Desk in Living Room" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.operations).toEqual([{ kind: "add", mainLineId: "desk", roomId: "living", source, quantity: 1, modeTier: "signature", pricingMode: "pmc" }]);
  });

  it("does not confirm an uncertain save when the returned version retained the wrong mode", async () => {
    const user = userEvent.setup(); const { saves } = setup(quotation(), { lostWrongMode: true });
    await user.click(await screen.findByRole("switch", { name: toggleName }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/The save response could not be verified/)).toBeVisible();
    expect(screen.queryByText("Changes saved. Your team will review the revised quotation before approval.")).not.toBeInTheDocument();
    expect(saves).toHaveLength(1);
  });
});
