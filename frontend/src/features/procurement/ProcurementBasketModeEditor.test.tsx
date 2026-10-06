import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProcurementBasketModeEditor } from "./ProcurementBasketModeEditor";
import type { ProcurementBasketLine } from "./procurementBasketApi";
import type { PurchaseOrderModeDraftPreview, PurchaseOrderModePreview, PurchaseOrderModeResolution } from "./purchaseOrderApi";

const digest = "a".repeat(64);
const estimateSource = { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: null };
const configuredPreview: PurchaseOrderModePreview = {
  formulaVersion: "mode-v1", mode: "in_house", quantity: "2", quantityScale: 2,
  baseCostPaise: 10000, adjustedCostPaise: 12500, lowQuantityImpactPaise: 2500,
  sellingPaise: 17500, finalVendorChargesPaise: null, floorSellingPaise: 16000,
  marginBps: 2500, appliedImpactBps: 2500, discountBps: 0, discountAmountPaise: 0,
  quantityRule: null, procurementQuantitySuggestion: null,
  settings: { scopes: [{ scope: "in_house_labor", source: "scoped", baseRatePaise: 5000,
    lowQuantityLimit: "150", impactBps: 2500, minimumMarkupBps: 2000, startingMarkupBps: 2500 }],
    configuredMarginBps: 2500, markupBasis: "starting" },
  components: [{ scope: "labor", adjustedCostPaise: 12500, sellingPaise: 17500, floorSellingPaise: 16000 }]
};
const line: ProcurementBasketLine = { sourceLineItemKey: "room-one:line-one", roomId: "room-one", roomName: "Living Room",
  subBasketId: "sub-one", subBasketName: "False Ceiling", mainLineId: "line-one", mainLineName: "POP false ceiling",
  approvedQuantity: "2", approvedUnit: "sq-ft", approvedAmountPaise: 20000, included: true, source: "configuration",
  baseUnitRatePaise: null, projectRate: { version: 0, overridePaise: null }, standardCost: null,
  mode: { state: "selection_required", options: [{ key: "pmc", label: "PMC" }, { key: "sub_vendor", label: "Sub-vendor" },
    { key: "in_house", label: "In-house" }], decision: null, preview: null, issues: [],
    revision: { id: "revision-one", version: 2, status: "active", contentDigest: digest },
    uom: { id: "uom-one", code: "sq-ft", decimalScale: 2 } } };
const previewResponse: PurchaseOrderModeDraftPreview = { projectId: "project-one", estimateSource,
  sourceLineItemKey: line.sourceLineItemKey, decisionVersion: 0, revision: line.mode!.revision,
  uom: line.mode!.uom, preview: configuredPreview, scopes: [], issues: [] };

describe("basket configured mode editor", () => {
  it("previews the selected execution source and saves its server calculation decision", async () => {
    const previews: unknown[] = []; const saves: unknown[] = [];
    server.use(
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
        previews.push(await request.json()); return HttpResponse.json({ data: previewResponse });
      }),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        saves.push(await request.json()); return HttpResponse.json({ data: { id: "decision-one", version: 1,
          sourceLineItemKey: line.sourceLineItemKey, mode: "in_house", quantity: "2", discountBps: 0,
          markupBasis: "starting", exceptionReason: null, revisionId: "revision-one", revisionDigest: digest,
          updatedAt: "2026-10-05T00:00:00Z" } });
      })
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<ProcurementBasketModeEditor projectId="project-one" basketId="basket-one"
      source={estimateSource} line={line} classification="special" frozen={false} />);
    await user.click(screen.getByRole("button", { name: "Choose mode for POP false ceiling" }));
    await user.click(screen.getByRole("radio", { name: "Execution" }));
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    expect(screen.getByRole("button", { name: "Preview calculation" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Preview calculation" }));
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({ sourceLineItemKey: line.sourceLineItemKey, mode: "in_house", quantity: "2", expectedVersion: 0 });
    expect(screen.getByText("Base amount")).toBeVisible();
    expect(screen.getByText("₹100.00")).toBeVisible();
    expect(screen.getByText("Total")).toBeVisible();
    expect(screen.getByText("₹125.00")).toBeVisible();
    expect(screen.queryByText("Low quantity impact")).not.toBeInTheDocument();
    expect(screen.queryByText("₹175.00")).not.toBeInTheDocument();
    const report = await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save mode" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ sourceLineItemKey: line.sourceLineItemKey, mode: "in_house", quantity: "2",
      expectedEstimateSource: estimateSource, expectedRevisionDigest: digest });
  });

  it("keeps historical unclassified Standard mode editing without a separate impact row", async () => {
    const previews: unknown[] = []; const saves: unknown[] = [];
    const suggestedLine: ProcurementBasketLine = { ...line, standardCost: {
      state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
      baseRates: [{ scope: "sub_vendor", ratePaise: 5_000 }], baseCostPaise: 10_000,
      adjustedCostPaise: 12_500, issues: []
    }, mode: { ...line.mode!, availability: [{ key: "sub_vendor", label: "Sub-vendor", available: true, issues: [] }] } };
    const standardPreview: PurchaseOrderModePreview = { ...configuredPreview, mode: "sub_vendor",
      settings: { ...configuredPreview.settings, scopes: [{ ...configuredPreview.settings.scopes[0]!, scope: "sub_vendor" }] } };
    server.use(
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
        previews.push(await request.json()); return HttpResponse.json({ data: { ...previewResponse, preview: standardPreview } });
      }),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        saves.push(await request.json()); return HttpResponse.json({ data: { id: "decision-standard", version: 1 } });
      })
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<ProcurementBasketModeEditor projectId="project-one" basketId="basket-one"
      source={estimateSource} line={suggestedLine} classification="standard" frozen={false} compact />);
    expect(screen.queryByText("₹50.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Low quantity impact")).not.toBeInTheDocument();
    expect(saves).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Confirm mode for POP false ceiling" }));
    expect(screen.getByRole("radio", { name: "Execution" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sub-vendor" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Calculation quantity for POP false ceiling" })).toHaveValue("2");
    await user.click(screen.getByRole("button", { name: "Preview calculation" }));
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({ mode: "sub_vendor", quantity: "2", expectedVersion: 0 });
    expect(screen.getByRole("button", { name: "Save mode" })).toBeEnabled();
    expect(screen.getByText("Base amount")).toBeVisible();
    expect(screen.getByText("Total")).toBeVisible();
    expect(screen.queryByText("Low quantity impact")).not.toBeInTheDocument();
    expect(screen.queryByText("Working")).not.toBeInTheDocument();
    const quantity = screen.getByRole("textbox", { name: "Calculation quantity for POP false ceiling" });
    await user.clear(quantity);
    await user.type(quantity, "3");
    expect(screen.queryByRole("button", { name: "Save mode" })).not.toBeInTheDocument();
    expect(screen.getByText(/Preview the changed calculation before saving/u)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Preview calculation" }));
    await waitFor(() => expect(previews).toHaveLength(2));
    expect(previews[1]).toMatchObject({ mode: "sub_vendor", quantity: "3" });
    await user.click(screen.getByRole("button", { name: "Save mode" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ mode: "sub_vendor", quantity: "3", expectedVersion: 0 });
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("requires Configuration recovery for historical unclassified Standard mode editing", async () => {
    const observedDigest = "b".repeat(64);
    const mismatch = { code: "PINNED_DIGEST_MISMATCH", message: "The saved Configuration content does not match its activated digest." };
    const observedLine: ProcurementBasketLine = { ...line,
      standardCost: { state: "observed_unverified", mode: "sub_vendor", calculationQuantity: "2",
        baseRates: [{ scope: "sub_vendor", ratePaise: 5_000 }], baseCostPaise: 10_000,
        adjustedCostPaise: 12_500, issues: [mismatch] },
      mode: { ...line.mode!, state: "unavailable", issues: [mismatch],
        integrity: { status: "mismatch", activatedDigest: digest, observedDigest,
          candidateAvailability: [{ key: "sub_vendor", label: "Sub-vendor", available: true, issues: [] }] } } };
    const previews: unknown[] = []; const saves: unknown[] = [];
    server.use(
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-previews", async ({ request }) => {
        previews.push(await request.json());
        return HttpResponse.json({ data: { ...previewResponse, preview: { ...configuredPreview, mode: "sub_vendor" } } });
      }),
      http.post("/api/v1/procurement/projects/project-one/purchase-order-mode-decisions", async ({ request }) => {
        saves.push(await request.json()); return HttpResponse.json({ data: { id: "decision-recovered", version: 1 } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketModeEditor projectId="project-one" basketId="basket-one"
      source={estimateSource} line={observedLine} classification="standard" frozen={false} compact />);
    await user.click(screen.getByRole("button", { name: "Review mode for POP false ceiling" }));
    expect(screen.getByRole("radio", { name: "Execution" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sub-vendor" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Preview calculation" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Confirmed observed configuration cost");
    await user.click(screen.getByRole("checkbox", { name: /I reviewed the observed saved content/u }));
    await user.click(screen.getByRole("button", { name: "Preview calculation" }));
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toMatchObject({ mode: "sub_vendor", quantity: "2", expectedObservedDigest: observedDigest });
    await user.click(screen.getByRole("button", { name: "Save mode" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ mode: "sub_vendor", expectedRevisionDigest: digest,
      recovery: { expectedObservedDigest: observedDigest, reason: "Confirmed observed configuration cost", acknowledge: true } });
  });

  it("reconciles incoming saved decisions and keeps In-house base components separate", async () => {
    const suggestedLine: ProcurementBasketLine = { ...line, standardCost: {
      state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
      baseRates: [{ scope: "sub_vendor", ratePaise: 5_000 }], baseCostPaise: 10_000,
      adjustedCostPaise: 12_500, issues: []
    } };
    const savedLine: ProcurementBasketLine = { ...line, mode: { ...line.mode!, state: "ready",
      decision: { id: "saved-one", version: 3, sourceLineItemKey: line.sourceLineItemKey,
        mode: "in_house", quantity: "3", discountBps: 0, markupBasis: "starting",
        exceptionReason: null, revisionId: "revision-one", revisionDigest: digest,
        updatedAt: "2026-10-05T00:00:00Z" }, preview: configuredPreview } as PurchaseOrderModeResolution,
      standardCost: { state: "saved", mode: "in_house", calculationQuantity: "3",
        baseRates: [{ scope: "in_house_labor", ratePaise: 3_000 }, { scope: "in_house_material", ratePaise: 2_000 }],
        baseCostPaise: 15_000, adjustedCostPaise: 16_000, issues: [] } };
    function Harness() {
      const [currentLine, setCurrentLine] = useState(suggestedLine);
      return <><button type="button" onClick={() => setCurrentLine(savedLine)}>Receive saved decision</button>
        <ProcurementBasketModeEditor projectId="project-one" basketId="basket-one"
          source={estimateSource} line={currentLine} classification="standard" frozen={false} /></>;
    }
    const user = userEvent.setup(); renderWithQuery(<Harness />);
    await user.click(screen.getByRole("button", { name: "Confirm mode for POP false ceiling" }));
    expect(screen.getByRole("radio", { name: "Sub-vendor" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Receive saved decision" }));
    expect(screen.getByRole("radio", { name: "In-house" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Calculation quantity for POP false ceiling" })).toHaveValue("3");
    expect(screen.queryByText("In-house labor base rate / sq-ft")).not.toBeInTheDocument();
    expect(screen.queryByText("In-house material base rate / sq-ft")).not.toBeInTheDocument();
    expect(screen.queryByText("Low quantity impact")).not.toBeInTheDocument();
  });
});
