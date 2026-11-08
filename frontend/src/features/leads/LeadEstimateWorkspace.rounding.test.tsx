import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "sales-rounding", role: "estimator_sales" },
  authorization: { permissions: ["estimation.estimate.save", "estimation.estimate.submit", "estimation.estimate.send_client"] },
  reviewSession: { id: "rounding-session" }, status: "authenticated" }) }));
vi.mock("./estimateRevisionsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./estimateRevisionsApi")>(),
  getEstimateRevisions: vi.fn(async () => ({ items: [], pagination: { limit: 20, nextCursor: null } }))
}));

function setup(subtotalPaise: number, gstPaise: number, frozen = false) {
  const draft = {
    id: "estimate-rounding", version: 1, status: frozen ? "sent_to_client" : "draft", approvalRequired: false,
    propertyType: "2BHK", rooms: [{ id: "room-living", label: "Living Room", typeId: "living", sqft: 300 }],
    scopes: [], selectedMainBasketIds: ["basket"],
    subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise,
    subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100,
    lineItems: [{ id: "saved-line", source: "configuration", catalogueId: "main-line", roomId: "room-living", roomName: "Living Room",
      mainBasketId: "basket", mainBasketName: "Finishes", subBasketId: "sub", subBasketName: "Walls", mainLineId: "main-line", mainLineName: "Wall finish",
      itemType: "main_line", classification: "special", pricingMode: "pmc", modeTier: "signature", rateSource: "manual",
      revisionId: "revision", sourceItemVersion: 1, sourceRevisionVersion: 1,
      uomId: "uom", uomName: "sq ft", uomCode: "SQFT", uomDecimalScale: 2, unit: "sq ft", specification: null,
      quantity: 1, ratePaise: subtotalPaise, rate: subtotalPaise / 100, amountPaise: subtotalPaise, amount: subtotalPaise / 100, included: true }]
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    const respond = (data: unknown) => Response.json({ data });
    if (url.endsWith("/leads/lead-rounding")) return respond({ id: "lead-rounding", clientName: "Sample client", projectName: "Sample home", location: "Pune", propertyType: "2BHK" });
    if (url.endsWith("/leads/lead-rounding/estimate")) return respond(draft);
    if (url.includes("/estimation/catalogue?")) return respond({ items: [], pagination: { limit: 100, offset: 0, total: 0, hasMore: false }, ineligibleLineCount: 0 });
    if (url.includes("/estimation/catalogue/recommendations?")) return respond({ sources: [] });
    if (url.includes("/estimate-plan-change-requests?")) return respond([]);
    if (url.endsWith("/design-uploads")) return respond({ uploads: [], drawings: [] });
    throw new Error(`Unexpected rounding request: ${url}`);
  });
  renderWithQuery(<MemoryRouter initialEntries={["/estimate/lead-rounding"]}><Routes>
    <Route path="/estimate/:leadId" element={<LeadEstimateWorkspace />} />
  </Routes></MemoryRouter>);
}

describe("staff final estimate rounding", () => {
  it("marks aggregate overflow incomplete even when the individual amount is valid", async () => {
    setup(8_000_000_000_000_000, 1_440_000_000_000_000);
    const user = userEvent.setup();
    const rate = await screen.findByRole("textbox", { name: /Selling rate/ });
    await waitFor(() => expect(rate).toHaveValue("80000000000000"));
    expect(screen.queryByText("Amount too large for this quantity and price.")).not.toBeInTheDocument();
    expect(screen.getByText("Total incomplete")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Summary" }));
    const summary = screen.getByRole("heading", { name: "Estimate summary" }).closest("section")!;
    expect(within(summary).getByText("Total (incl. GST)").closest("span")).toHaveTextContent("Incomplete");
    expect(within(summary).queryByText("₹0")).not.toBeInTheDocument();
    expect(within(summary).queryByText("Round off")).not.toBeInTheDocument();
  });
  it.each([
    { subtotalPaise: 8664, gstPaise: 1560, total: "₹102", adjustment: "−₹0.24" },
    { subtotalPaise: 10042, gstPaise: 1808, total: "₹118", adjustment: "−₹0.5" },
    { subtotalPaise: 8688, gstPaise: 1564, total: "₹103", adjustment: "+₹0.48" }
  ])("rounds only the final total for subtotal $subtotalPaise and GST $gstPaise", async ({ subtotalPaise, gstPaise, total, adjustment }) => {
    setup(subtotalPaise, gstPaise);
    const user = userEvent.setup();
    const rate = await screen.findByRole("textbox", { name: /Selling rate/ });
    await waitFor(() => expect(rate).toHaveValue(String(subtotalPaise / 100)));
    await user.click(screen.getByRole("button", { name: "Summary" }));
    const summary = screen.getByRole("heading", { name: "Estimate summary" }).closest("section")!;
    expect(within(summary).getByText("Sub-total").closest("span")).toHaveTextContent(`₹${subtotalPaise / 100}`);
    expect(within(summary).getByText("GST @ 18%").closest("span")).toHaveTextContent(`₹${gstPaise / 100}`);
    expect(within(summary).getByText("Total (incl. GST)").closest("span")).toHaveTextContent(total);
    expect(within(summary).getByText("Round off").closest("span")).toHaveTextContent(adjustment);
    expect(screen.getByText(`₹${subtotalPaise / 100} total`)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Proposal" }));
    expect(screen.getByText(new RegExp(`per sq ft`))).toHaveTextContent(`₹${subtotalPaise / 100} per sq ft`);
  });

  it("keeps frozen legacy totals exactly as saved without inventing a rounding adjustment", async () => {
    setup(8688, 1564, true);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Summary" }));
    const summary = screen.getByRole("heading", { name: "Estimate summary" }).closest("section")!;
    expect(within(summary).getByText("Total (incl. GST)").closest("span")).toHaveTextContent("₹102.52");
    expect(within(summary).getByText("GST @ 18%").closest("span")).toHaveTextContent("₹15.64");
    expect(within(summary).queryByText("Round off")).not.toBeInTheDocument();
  });
});
