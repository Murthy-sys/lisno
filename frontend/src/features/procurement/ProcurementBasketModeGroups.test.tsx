import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "procurement" }, authorization: null }) }));
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { createProcurementGroupFixture, qaEmptyModeGroups } from "../../test/fixtures/enterpriseProcurementData";
import { ProcurementBasketWorkspace } from "./ProcurementBasketWorkspace";
import type { BasketEnquiry, ProcurementBasketDetail, ProcurementBasketList } from "./procurementBasketApi";

function install() {
  const fixture = createProcurementGroupFixture();
  let data: ProcurementBasketList = fixture.list;
  let failed = false;
  let enquiry: BasketEnquiry | null = null;
  const reads: string[] = [];
  const creations: unknown[] = [];
  const dispatches: unknown[] = [];
  const details: ProcurementBasketDetail[] = fixture.details;
  server.use(
    http.get("/api/v1/procurement/projects/:projectId/baskets", ({ params }) => {
      reads.push(`list:${params.projectId}`);
      return failed ? HttpResponse.json({ error: { message: "Synthetic basket refresh failed." } }, { status: 503 }) : HttpResponse.json({ data });
    }),
    http.get("/api/v1/procurement/projects/:projectId/baskets/:basketId", ({ params }) => {
      reads.push(`detail:${params.projectId}:${params.basketId}`);
      return HttpResponse.json({ data: details.find((entry) => entry.id === params.basketId) });
    }),
    http.get("/api/v1/procurement/projects/:projectId/baskets/:basketId/enquiries", () => HttpResponse.json({ data: enquiry ? [enquiry] : [] })),
    http.get("/api/v1/procurement/projects/:projectId/baskets/:basketId/vendor-candidates", () => HttpResponse.json({ data: {
      projectCity: { name: "Bengaluru", key: "bengaluru" }, total: 1, matchingVendorCount: 1, blockedReasonCounts: {}, limit: 50, offset: 0,
      items: [{ vendorId: "vendor-one", code: "VEN-1", name: "Synthetic vendor", contactEmail: "vendor@example.test", kpiScoreBps: 8000,
        city: { name: "Bengaluru", key: "bengaluru" }, cityVersion: 1, cityMatch: "same_city", eligible: true, blockers: [] }] } })),
    http.get("/api/v1/procurement/projects/:projectId/purchase-order-preparation", () => HttpResponse.json({ data: {
      projectId: data.projectId, estimateSource: data.estimateSource, digest: details[0]!.preparationDigest,
      estimateLines: [], sections: [], approvedEstimatePaise: 197_000, committedPaise: 10_000, committedGstPaise: 0,
      committedTotalPaise: 10_000, remainingPaise: 187_000, netPaise: null, itemCount: 0, readyItemCount: 0, blockers: [],
      orderDefaults: { targetDate: "2026-11-30", deliveryLocation: "Synthetic site" } } })),
    http.post("/api/v1/procurement/projects/:projectId/baskets/:basketId/enquiries", async ({ request, params }) => {
      creations.push(await request.json());
      const detail = details.find((entry) => entry.id === params.basketId)!;
      enquiry = { id: "enquiry-one", projectId: data.projectId, mainBasketId: detail.id, version: 1, status: "draft",
        estimateSource: data.estimateSource, preparationDigest: detail.preparationDigest, vendorScopeCurrent: null,
        boqRevisionId: null, boqRevision: null, boqDigest: null, bidCount: 0, awardId: null, invitations: [],
        lines: detail.lines.map((line, index) => ({ id: `boq-${index}`, sourceLineItemKey: line.sourceLineItemKey,
          roomId: line.roomId, roomName: line.roomName, subBasketId: line.subBasketId, subBasketName: line.subBasketName,
          mainLineId: line.mainLineId, mainLineName: line.mainLineName, approvedQuantity: line.approvedQuantity,
          approvedUnit: line.approvedUnit, uomId: "uom-groups", uomCode: "sq-ft", uomDecimalScale: 2,
          description: line.mainLineName, quantityMilliUnits: 1000 })) };
      return HttpResponse.json({ data: enquiry });
    }),
    http.post("/api/v1/procurement/projects/:projectId/baskets/:basketId/enquiries/enquiry-one/dispatch", async ({ request }) => {
      dispatches.push(await request.json());
      enquiry = { ...enquiry!, version: 2, status: "sent", vendorScopeCurrent: true, boqRevisionId: "boq-revision",
        boqRevision: 1, boqDigest: "f".repeat(64), invitations: [] };
      return HttpResponse.json({ data: enquiry });
    }),
    http.get("/api/v1/procurement/projects/:projectId/baskets/:basketId/enquiries/enquiry-one/comparison", () => HttpResponse.json({ data: {
      enquiryId: "enquiry-one", boqRevisionId: "boq-revision", boqDigest: "f".repeat(64), comparisonDigest: "f".repeat(64),
      averageBidNetPaise: null, rows: [], recommendedBidId: null, awardId: null, bidHistory: [], bidHistoryHasMore: false,
      counteroffers: [], counteroffersHasMore: false } }))
  );
  return { fixture, reads, creations, dispatches, setList: (next: ProcurementBasketList) => { data = next; },
    setFailure: (next: boolean) => { failed = next; } };
}
function Location() { return <output aria-label="Current route">{useLocation().search}</output>; }
function renderWorkspace(options: { query?: string; stale?: boolean; estimateVersion?: number } = {}) {
  return renderWithQuery(<MemoryRouter initialEntries={[`/procurement/projects/project-one${options.query ?? ""}`]}>
    <Location /><ProcurementBasketWorkspace projectId="project-one" projectName="Synthetic Villa" projectSourceStale={options.stale ?? false}
      currentEstimate={{ estimateId: "estimate-one", estimateVersion: options.estimateVersion ?? 4 }} />
  </MemoryRouter>);
}
const openPop = (mode: string) => screen.findAllByRole("button", { name: `Open POP / Gypsum in ${mode}` });

describe("Procurement approved estimate mode groups", () => {
  it("renders backend subsets once per mode with disjoint amounts and same-named IDs", async () => {
    const installed = install(); renderWorkspace();
    const vendor = (await openPop("Sub-vendor"))[0]!;
    expect(within(vendor).getByText("2 included lines")).toBeVisible();
    expect(within(vendor).getByText("₹300.00")).toBeVisible();
    expect(within(vendor).getByText("₹240.00")).toBeVisible();
    expect(within((await openPop("PMC"))[0]!).getByText("₹400.00")).toBeVisible();
    const inHouse = await openPop("In-house");
    expect(inHouse).toHaveLength(2);
    expect(within(inHouse[0]!).getByText("₹300.00")).toBeVisible();
    expect(within(inHouse[1]!).getByText("₹900.00")).toBeVisible();
    expect(within(inHouse[1]!).getByText("Incomplete")).toBeVisible();
    expect(within(screen.getByRole("button", { name: "In-house" })).getByText("₹1,200.00")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "In-house ready for BOQ" })).toHaveAttribute("value", "50");
    expect(installed.reads).toEqual(["list:project-one"]);
  });

  it.each(["In-house", "Sub-vendor", "PMC"])("opens the full mixed basket from its %s subset without filtering source lines", async (label) => {
    const installed = install(); const user = userEvent.setup(); renderWorkspace();
    await user.click((await openPop(label))[0]!);
    const table = await screen.findByRole("table", { name: "Included approved source lines for POP / Gypsum" });
    expect(within(table).getAllByRole("rowheader")).toHaveLength(4);
    for (const line of installed.fixture.details[0]!.lines) expect(within(table).getByText(line.mainLineName)).toBeVisible();
    expect(screen.getByLabelText("Current route")).toHaveTextContent("basket=basket-mixed");
    expect(installed.reads).toContain("detail:project-one:basket-mixed");
    expect(screen.getByText(/All approved lines/i)).toBeVisible();
    expect(installed.creations).toEqual([]);
  });

  it("sends the exact existing whole-basket BOQ payload from an In-house subset", async () => {
    const installed = install(); const user = userEvent.setup(); renderWorkspace();
    await user.click((await openPop("In-house"))[0]!);
    await user.click(await screen.findByRole("checkbox", { name: /Synthetic vendor/ }));
    await user.click(screen.getByRole("button", { name: "Send bid invitations" }));
    await waitFor(() => expect(installed.dispatches).toHaveLength(1));
    expect(installed.creations).toHaveLength(1);
    expect(installed.creations[0]).toEqual({ expectedPreparationDigest: "e".repeat(64),
      lines: [{ sourceLineItemKey: "living:standard" }, { sourceLineItemKey: "living:special-vendor" },
        { sourceLineItemKey: "bedroom:in-house" }, { sourceLineItemKey: "bedroom:pmc" }], idempotencyKey: expect.any(String) });
    expect(installed.dispatches[0]).toEqual({ expectedVersion: 1, expectedPreparationDigest: "e".repeat(64),
      vendorIds: ["vendor-one"], idempotencyKey: expect.any(String) });
  });

  it("keeps local search, filters, view and disclosure state on Back with no writes or per-card reads", async () => {
    const installed = install(); const user = userEvent.setup(); renderWorkspace();
    const search = await screen.findByRole("searchbox", { name: "Search baskets" });
    await user.type(search, "  pOp / gYpSuM  ");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "BOQ readiness" }), "ready");
    const group = screen.getByRole("region", { name: "In-house baskets" });
    expect(within(group).getByText("1 of 2 baskets")).toBeVisible();
    expect(within(screen.getByRole("button", { name: "In-house" })).getByText("₹1,200.00")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "List view" }));
    await user.click(screen.getByRole("button", { name: "PMC" }));
    expect(installed.reads).toEqual(["list:project-one"]);
    await user.click((await openPop("Sub-vendor"))[0]!);
    await screen.findByRole("table", { name: "Included approved source lines for POP / Gypsum" });
    await user.click(screen.getByRole("button", { name: /Back to main baskets/ }));
    expect(screen.getByRole("searchbox", { name: "Search baskets" })).toHaveValue("  pOp / gYpSuM  ");
    expect(screen.getByRole("combobox", { name: "BOQ readiness" })).toHaveValue("ready");
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "PMC" })).toHaveAttribute("aria-expanded", "false");
    expect(installed.creations).toEqual([]); expect(installed.dispatches).toEqual([]);
  });

  it("shows distinct no results, readiness and mode filters without changing full totals", async () => {
    install(); const user = userEvent.setup(); renderWorkspace();
    const search = await screen.findByRole("searchbox", { name: "Search baskets" });
    await user.type(search, "no matching basket");
    expect(screen.getByText("No baskets match your search or filters.")).toBeVisible();
    expect(screen.queryByText("No approved main baskets are available for this project.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" })); expect(search).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Pricing mode" }), "in_house");
    await user.selectOptions(screen.getByRole("combobox", { name: "BOQ readiness" }), "attention");
    const matches = await openPop("In-house"); expect(matches).toHaveLength(1);
    expect(within(matches[0]!).getByText("₹900.00")).toBeVisible();
    expect(screen.queryByRole("region", { name: "PMC baskets" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(await openPop("In-house")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "Pricing mode" })).toHaveValue("all");
  });

  it("uses a static skeleton for unknown names and photo failures while retaining keyboard actions", async () => {
    install(); const user = userEvent.setup(); const view = renderWorkspace();
    const unknown = await screen.findByRole("button", { name: /Open Specialist conservation/ });
    expect(unknown.querySelector("img")).toBeNull();
    expect(unknown.querySelector(".procurement-mode__photo-placeholder")).not.toBeNull();
    expect(within(unknown).getByText("1 mode issue")).toBeVisible();
    const card = (await openPop("PMC"))[0]!;
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector(".procurement-mode__photo-placeholder")).not.toBeNull();
    expect(screen.queryByText(/loading photo/i)).not.toBeInTheDocument();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    card.focus(); await user.keyboard("{Enter}");
    expect(await screen.findByRole("table", { name: "Included approved source lines for POP / Gypsum" })).toBeVisible();
  });

  it.each(["missing", "duplicate source", "invalid cost"])("keeps malformed %s groups out of the overview while preserving deep-link detail", async (kind) => {
    const installed = install(); const data = structuredClone(installed.fixture.list);
    if (kind === "missing") delete data.modeGroups;
    else if (kind === "duplicate source") data.modeGroups![2]!.baskets[0]!.sourceLineItemKeys = ["living:standard"];
    else data.modeGroups![0]!.currentCostPaise = 0;
    installed.setList(data); const user = userEvent.setup(); renderWorkspace({ query: "?basket=basket-mixed" });
    expect(await screen.findByRole("table", { name: "Included approved source lines for POP / Gypsum" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Back to main baskets/ }));
    expect(await screen.findByText(/Approved estimate mode groups are unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Open POP/ })).not.toBeInTheDocument();
    installed.setList(installed.fixture.list);
    await user.click(screen.getByRole("button", { name: "Refresh baskets" }));
    expect((await openPop("Sub-vendor"))[0]!).toBeVisible();
  });

  it("keeps empty groups collapsed and zero readiness distinct from an empty project", async () => {
    const installed = install();
    installed.setList({ ...installed.fixture.list, baskets: [], modeGroups: qaEmptyModeGroups() });
    const user = userEvent.setup(); renderWorkspace();
    expect(await screen.findByText("No approved main baskets are available for this project.")).toBeVisible();
    const pmc = screen.getByRole("button", { name: "PMC" });
    expect(pmc).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await user.click(pmc);
    expect(within(screen.getByRole("region", { name: "PMC baskets" })).getByText("No items in this mode.")).toBeVisible();
  });

  it("preserves source mismatch and removed basket states", async () => {
    install(); const view = renderWorkspace({ estimateVersion: 5 });
    expect(await screen.findByText(/approved estimate changed/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Open POP/ })).not.toBeInTheDocument();
    view.unmount(); renderWorkspace({ query: "?basket=removed-basket" });
    expect(await screen.findByText("This main basket is no longer in the approved estimate.")).toBeVisible();
  });

  it("recovers a list failure and preserves the stale-source dispatch freeze", async () => {
    const installed = install(); installed.setFailure(true); const user = userEvent.setup(); renderWorkspace({ stale: true });
    await screen.findByText("Synthetic basket refresh failed.");
    installed.setFailure(false); await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.click((await openPop("PMC"))[0]!);
    const vendor = await screen.findByRole("checkbox", { name: /Synthetic vendor/ });
    if (!vendor.hasAttribute("disabled")) await user.click(vendor);
    expect(screen.getByRole("button", { name: "Send bid invitations" })).toBeDisabled();
    expect(installed.creations).toEqual([]); expect(installed.dispatches).toEqual([]);
  });

  it("isolates unequal projects and resets presentation state with the project lifecycle", async () => {
    const installed = install(); const user = userEvent.setup();
    function Projects() {
      const [projectId, setProjectId] = useState("project-one");
      return <><button onClick={() => setProjectId("project-two")}>Open second project</button>
        <ProcurementBasketWorkspace key={projectId} projectId={projectId} projectName={projectId} projectSourceStale={false}
          currentEstimate={{ estimateId: projectId === "project-one" ? "estimate-one" : "estimate-two", estimateVersion: 4 }} /></>;
    }
    renderWithQuery(<MemoryRouter><Projects /></MemoryRouter>);
    await user.type(await screen.findByRole("searchbox", { name: "Search baskets" }), "POP");
    await user.click(screen.getByRole("button", { name: "List view" }));
    const metric = { includedLineCount: 1, boqReadyLineCount: 1, readinessPercent: 100,
      approvedEstimatePaise: 125_000, currentCostPaise: 96_000, currentCostComplete: true,
      unpricedLineCount: 0, committedNetPaise: 0, modeIssueCount: 0 };
    installed.setList({ projectId: "project-two", estimateSource: { ...installed.fixture.list.estimateSource, estimateId: "estimate-two" },
      baskets: [{ ...installed.fixture.list.baskets[0]!, name: "Painting", includedLineCount: 1, readyLineCount: 1,
        approvedEstimatePaise: 125_000, baseCostPaise: 96_000, adjustedCostPaise: 96_000, workingTotalPaise: 96_000, committedNetPaise: 0 }],
      modeGroups: qaEmptyModeGroups().map((group) => group.mode !== "pmc" ? group : { ...group, ...metric, basketCount: 1,
        baskets: [{ ...metric, id: "basket-mixed", name: "Painting", sourceLineItemKeys: ["second-room:painting"] }] }) });
    await user.click(screen.getByRole("button", { name: "Open second project" }));
    const painting = await screen.findByRole("button", { name: "Open Painting in PMC" });
    expect(within(painting).getByText("₹1,250.00")).toBeVisible();
    expect(within(painting).getByText("₹960.00")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search baskets" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Open POP/ })).not.toBeInTheDocument();
    expect(installed.reads).toEqual(["list:project-one", "list:project-two"]);
    expect(installed.creations).toEqual([]);
  });

  it("preserves a denied list response without exposing grouped data", async () => {
    const installed = install();
    server.use(http.get("/api/v1/procurement/projects/project-one/baskets", () =>
      HttpResponse.json({ error: { code: "FORBIDDEN", message: "You cannot access this procurement project." } }, { status: 403 })));
    renderWorkspace();
    expect(await screen.findByText("You cannot access this procurement project.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Open POP/ })).not.toBeInTheDocument();
    expect(installed.creations).toEqual([]);
  });

});
