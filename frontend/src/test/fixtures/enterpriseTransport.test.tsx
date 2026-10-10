import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transferableAbortController } from "node:util";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AppRoutes } from "../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { server } from "../server";
import { tokenStorage } from "../../api/client";
import type { ProcurementProject, Role } from "../../api/types";
import { installEnterpriseTransport, type EnterpriseScenario } from "./enterpriseTransport";
import type { ProcurementBasketDetail, ProcurementBasketList } from "../../features/procurement/procurementBasketApi";
import { hasValidProcurementModeGroups } from "../../features/procurement/procurementBasketApi";
import type { EstimateDraft } from "../../features/leads/leadsApi";
import type { EstimationCataloguePage, EstimationCatalogueRecommendations } from "../../features/leads/estimationCatalogueApi";
import { procurementProjectsIntegrityError } from "../../features/procurement/procurementPresentation";

let transport: ReturnType<typeof installEnterpriseTransport> | undefined;
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:synthetic-document"; } static revokeObjectURL() {} });
});
afterEach(() => { cleanup?.(); cleanup = undefined; transport?.restore(); transport = undefined; vi.unstubAllGlobals(); });
function mount(route: string, role: Role, state: EnterpriseScenario["state"] = "populated") {
  transport = installEnterpriseTransport({ route, role, state });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "*", element: <AppRoutes /> }], { initialEntries: [route] });
  const view = render(<QueryClientProvider client={client}><FeedbackProvider><AuthProvider><RouterProvider router={router} /></AuthProvider></FeedbackProvider></QueryClientProvider>);
  cleanup = () => { view.unmount(); router.dispose(); client.clear(); };
  return { client, view, router };
}
const routes: [string, Role][] = [
  ["/admin/dashboard", "super_admin"], ["/admin/dashboard?tab=projects", "super_admin"],
  ["/admin/projects", "admin"], ["/admin/projects/project-1", "admin"], ["/admin/projects/project-murthy", "super_admin"],
  ["/admin/users", "super_admin"], ["/admin/access-requests", "admin"],
  ["/admin/client-responses", "admin"], ["/admin/client-responses/round-1", "admin"],
  ["/admin/design-approvals", "super_admin"], ["/access-requests/mine", "designer"],
  ["/designer", "designer"], ["/designer/design-plans", "designer"], ["/designer/projects/project-aurora-villa", "designer"],
  ["/manager", "design_manager"], ["/manager/designers/designer-1", "design_manager"], ["/manager/projects/project-aurora-villa", "design_manager"],
  ["/head", "design_head"], ["/client", "client"], ["/client/projects/project-villa", "client"],
  ["/estimator-sales", "estimator_sales"], ["/estimator-sales/leads/lead-1", "estimator_sales"], ["/estimator-sales/leads/lead-1/estimate", "estimator_sales"],
  ["/finance", "finance_head"], ["/finance/projects/project-one", "finance_head"], ["/finance/projects/project%2Ftwo", "finance_head"],
  ["/home", "procurement"], ["/procurement/projects/project-one", "procurement"], ["/vendor", "vendor"], ["/home", "worker_electrician"], ["/home", "site_manager"],
  ["/admin/configuration/estimation", "super_admin"], ["/admin/configuration/estimation/items/line-1", "super_admin"], ["/admin/configuration/estimation/reusable-values", "super_admin"]
];
describe("synthetic enterprise route harness", () => {
  it("gates the recommendation scrolling fixture without changing mode or basket defaults", async () => {
    const read = async <T,>(path: string) => (await (await fetch(`/api/v1${path}`)).json()).data as T;
    for (const query of ["qaRecommendationScroll=ready", "qaEstimateModes=ready", "qaEstimateModes=ready&qaBasketCards=ready"]) {
      transport = installEnterpriseTransport({ route: `/estimator-sales/leads/lead-1/estimate?${query}`, role: "estimator_sales", state: "populated" });
      const catalogue = await read<EstimationCataloguePage>("/estimation/catalogue");
      expect(catalogue.items.flatMap((basket) => basket.subBaskets.flatMap((subBasket) => subBasket.mainLines))
        .some((line) => line.mainLineId === "line-probable-source")).toBe(false);
      if (query === "qaEstimateModes=ready") {
        expect(catalogue.items).toHaveLength(2);
        const recommendations = await read<EstimationCatalogueRecommendations>("/estimation/catalogue/recommendations?mainLineIds=line-ceiling");
        expect(recommendations.sources[0]?.rules).toEqual([]);
      }
      if (query.includes("qaBasketCards")) {
        const draft = await read<EstimateDraft>("/leads/lead-1/estimate");
        expect(draft.lineItems).toHaveLength(0);
        expect(catalogue.items).toHaveLength(6);
      }
      expect(transport.requests.filter((request) => request.unexpected)).toEqual([]);
      transport.restore();
    }
  });

  it("serves current optional, required, shared and sub-basket rules with two unequal scrolling rooms", async () => {
    transport = installEnterpriseTransport({ route: "/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready&qaRecommendationScroll=ready",
      role: "estimator_sales", state: "populated" });
    const read = async <T,>(path: string) => (await (await fetch(`/api/v1${path}`)).json()).data as T;
    const catalogue = await read<EstimationCataloguePage>("/estimation/catalogue");
    const lines = catalogue.items.flatMap((basket) => basket.subBaskets.flatMap((subBasket) => subBasket.mainLines));
    expect(catalogue.items).toHaveLength(6);
    expect(lines).toHaveLength(35);
    const initial = await read<EstimateDraft>("/leads/lead-1/estimate");
    expect(initial.rooms).toMatchObject([{ id: "living-room", sqft: 192 }, { id: "master-bedroom", sqft: 143 }]);
    expect(initial.lineItems).toHaveLength(70);
    expect(initial.selectedMainBasketIds).toHaveLength(6);
    expect(initial.lineItems.filter((line) => line.included)).toHaveLength(4);
    const totals = initial.rooms.map((room) => initial.lineItems.filter((line) => line.source === "configuration" && line.roomId === room.id && line.included)
      .reduce((total, line) => total + (line.amountPaise ?? 0), 0));
    expect(totals[0]).not.toBe(totals[1]);

    const sourceIds = ["line-ceiling", "line-probable-source", "line-required-source", "line-mixed-source", "line-subbasket-source", "line-unavailable-source"];
    const recommendations = await read<EstimationCatalogueRecommendations>(`/estimation/catalogue/recommendations?mainLineIds=${sourceIds.join(",")}`);
    for (const source of recommendations.sources) {
      const line = lines.find((item) => item.mainLineId === source.mainLineId)!;
      expect(source).toMatchObject({ available: true, revisionId: line.revisionId, revisionVersion: line.revisionVersion, itemVersion: line.itemVersion });
      for (const rule of source.rules.filter((item) => item.available && item.targetKind === "main_line")) {
        const target = lines.find((item) => item.mainLineId === rule.targetMainLineId)!;
        expect(rule).toMatchObject({ targetRevisionId: target.revisionId, targetRevisionVersion: target.revisionVersion, targetItemVersion: target.itemVersion });
      }
    }
    const rules = (id: string) => recommendations.sources.find((source) => source.mainLineId === id)!.rules;
    expect(rules("line-probable-source")).toMatchObject([{ requirement: "can", targetMainLineId: "line-cove" }]);
    expect(rules("line-required-source")).toMatchObject([{ requirement: "must", targetMainLineId: "line-cove" }]);
    expect(rules("line-mixed-source")).toMatchObject([{ requirement: "must", targetMainLineId: "line-painting" }, { requirement: "can", targetMainLineId: "line-cove" }]);
    const subBasketRule = rules("line-subbasket-source")[0]!;
    expect(subBasketRule).toMatchObject({ requirement: "can", targetKind: "sub_basket", unavailableChildCount: 0 });
    expect(subBasketRule.children).toHaveLength(2);
    for (const child of subBasketRule.children!) {
      const target = lines.find((item) => item.mainLineId === child.mainLineId)!;
      expect(child).toMatchObject({ available: true, revisionId: target.revisionId, revisionVersion: target.revisionVersion, itemVersion: target.itemVersion });
    }
    expect(rules("line-unavailable-source")).toMatchObject([{ requirement: "can", available: false, completionRequired: true }]);

    const lineItems = initial.lineItems.map((line) => line.source === "configuration" && line.roomId === "living-room" && line.mainLineId === "line-probable-source"
      ? { ...line, included: true } : line);
    expect((await fetch("/api/v1/leads/lead-1/estimate", { method: "PUT", body: JSON.stringify({ ...initial, expectedVersion: 1, lineItems }) })).status).toBe(200);
    const saved = await read<EstimateDraft>("/leads/lead-1/estimate");
    expect(saved.version).toBe(2);
    expect(saved.lineItems.filter((line) => line.included)).toHaveLength(5);
    expect(saved.lineItems.filter((line) => line.source === "configuration" && line.mainLineId === "line-cove").every((line) => !line.included)).toBe(true);
    expect(transport.requests.filter((request) => request.unexpected)).toEqual([]);
  });

  it("renders the recommendation scrolling fixture with a saved summary and unopened review", async () => {
    const { client } = mount("/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready&qaRecommendationScroll=ready", "estimator_sales");
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(await screen.findByRole("button", { name: "Review recommendations" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Recommendations for Living Room" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Ambient ceiling details/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Final timber finish inspection/ })).toBeInTheDocument();
    expect(transport?.requests.filter((request) => request.unexpected)).toEqual([]);
  });

  it("enables only the scrolling fixture's read-only Messages navigation and destination", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width") || query.includes("pointer: fine"),
      media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    transport = installEnterpriseTransport({ route: "/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready", role: "estimator_sales", state: "populated" });
    const defaultAuthorization = (await (await fetch("/api/v1/auth/authorization")).json()).data;
    expect(defaultAuthorization.permissions).not.toContain("chat.read");
    transport.restore();
    mount("/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready&qaRecommendationScroll=ready", "estimator_sales");
    const navigation = await screen.findByRole("navigation", { name: "Project sections" });
    const link = await within(navigation).findByRole("link", { name: "Messages" });
    expect(link).toHaveAttribute("href", "/projects/project-1/messages");
    await waitFor(() => expect(transport?.requests.some((request) => request.path === "/projects/project-1/chat/events" && request.status === 200)).toBe(true));
    expect(transport?.requests.filter((request) => request.unexpected || request.method !== "GET")).toEqual([]);
    cleanup?.(); cleanup = undefined; transport?.restore();
    const { client } = mount("/projects/project-1/messages?qaEstimateModes=ready&qaRecommendationScroll=ready", "estimator_sales");
    expect(await screen.findByRole("textbox", { name: "Message the project team" })).toBeDisabled();
    expect(await screen.findByText("Sending is not available for your current access.")).toBeVisible();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(transport?.requests.some((request) => request.path === "/projects/project-1/chat/messages" && request.status === 200)).toBe(true);
    expect(transport?.requests.filter((request) => request.unexpected || request.method !== "GET")).toEqual([]);
    expect((await fetch("/api/v1/projects/project-1/chat/messages", { method: "POST", body: "{}" })).status).toBe(422);
  });

  it("provides six basket cards with description and empty states only in the opted-in fixture", async () => {
    transport = installEnterpriseTransport({
      route: "/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready&qaBasketCards=ready",
      role: "estimator_sales", state: "populated"
    });
    const catalogue = (await (await fetch("/api/v1/estimation/catalogue")).json()).data;
    expect(catalogue.items).toHaveLength(6);
    expect(catalogue.items[0]).toMatchObject({ name: "POP / Gypsum", description: expect.stringContaining("gypsum boards") });
    expect(catalogue.items[4]).toMatchObject({ name: "Electrical Works", description: null, subBaskets: [] });
    const draft = (await (await fetch("/api/v1/leads/lead-1/estimate")).json()).data;
    expect(draft).toMatchObject({ selectedMainBasketIds: ["basket-ceiling"], lineItems: [], totalPaise: 0 });
    expect(transport.requests.every((request) => !request.unexpected)).toBe(true);
  });

  it("round trips mode pricing only in the gated local estimate scenario", async () => {
    const route = "/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready";
    transport = installEnterpriseTransport({ route, role: "estimator_sales", state: "populated" });
    const path = "/api/v1/leads/lead-1/estimate";
    const read = async () => (await (await fetch(path)).json()).data as EstimateDraft;
    const initial = await read();
    expect(initial).toMatchObject({ version: 1, subtotalPaise: 170_000, gstPaise: 30_600, totalPaise: 200_600 });
    expect(initial.lineItems.filter((line) => line.included)).toHaveLength(2);
    const lineItems = initial.lineItems.map((line) => line.source === "configuration" && line.mainLineId === "line-ceiling"
      ? { ...line, pricingMode: "in_house", rateSource: "manual", ratePaise: 12_345 } : line);
    const response = await fetch(path, { method: "PUT", body: JSON.stringify({ ...initial, expectedVersion: initial.version, lineItems }) });
    expect(response.status).toBe(200);
    expect(await read()).toMatchObject({ version: 2, subtotalPaise: 173_450, gstPaise: 31_221, totalPaise: 204_671 });
    expect((await read()).lineItems[0]).toMatchObject({ pricingMode: "in_house", rateSource: "manual", ratePaise: 12_345 });

    window.dispatchEvent(new CustomEvent("enterprise-qa-estimate-mode-rates", { detail: {
      mainLineId: "line-ceiling", modeBaseRatesPaise: { pmc: 21_000, sub_vendor: 22_000, in_house: 23_000 }
    } }));
    expect((await read()).lineItems[0]).toMatchObject({ ratePaise: 12_345, sourceRevisionVersion: 4 });
    window.dispatchEvent(new CustomEvent("enterprise-qa-estimate-mode-rates", { detail: {
      mainLineId: "line-painting", modeBaseRatesPaise: { pmc: 2_000, sub_vendor: 3_500, in_house: 4_000 }
    } }));
    const updated = await read();
    expect(updated.lineItems[3]).toMatchObject({ pricingMode: "sub_vendor", rateSource: "configuration", ratePaise: 3_500, sourceRevisionVersion: 6 });
    expect(updated.subtotalPaise).toBe(193_450);
    const catalogue = (await (await fetch("/api/v1/estimation/catalogue")).json()).data;
    expect(catalogue.items[0].subBaskets[0].mainLines[1].modeBaseRatesPaise.pmc).toBeNull();
    expect(catalogue.items[0].subBaskets[0].mainLines[2].modeBaseRatesPaise.pmc).toBe(0);
    expect((await fetch("/api/v1/projects", { method: "POST", body: "{}" })).status).toBe(422);
    expect(transport.requests.filter((request) => request.unexpected)).toEqual([]);

    transport.restore();
    transport = installEnterpriseTransport({ route: "/estimator-sales/leads/lead-1/estimate", role: "estimator_sales", state: "populated" });
    expect((await fetch(path, { method: "PUT", body: JSON.stringify(initial) })).status).toBe(422);
    transport.restore();
    transport = installEnterpriseTransport({ route, role: "estimator_sales", state: "mutation-error" });
    expect((await fetch(path, { method: "PUT", body: JSON.stringify(initial) })).status).toBe(422);
  });
  it("renders the populated mode-pricing fixture without unknown reads", async () => {
    const { client } = mount("/estimator-sales/leads/lead-1/estimate?qaEstimateModes=ready", "estimator_sales");
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await waitFor(() => expect(screen.getByRole("radio", { name: "PMC pricing mode for False ceiling, Ceiling finishes, False ceiling in Living Room", checked: true })).toBeInTheDocument());
    expect(transport?.requests.filter((request) => request.unexpected)).toEqual([]);
  });
  it.each(routes)("renders %s as %s with only registered mock reads", async (route, role) => {
    const { client } = mount(route, role);
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(transport?.requests.filter((r) => r.unexpected), JSON.stringify(transport?.requests.filter((r) => r.unexpected))).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Unexpected Application Error|Synthetic QA render failed|Cannot read properties/);
    expect(document.querySelector("main")).toBeTruthy();
  });
  it("serves default procurement reads while keeping configured modes opt-in", async () => {
    transport = installEnterpriseTransport({ route: "/procurement/projects/project-one", role: "procurement", state: "populated" });
    const defaultPreparation = (await (await fetch("/api/v1/procurement/projects/project-one/purchase-order-preparation")).json()).data;
    const defaultRequests = (await (await fetch("/api/v1/procurement/projects/project-one/purchase-order-requests?limit=50&offset=0")).json()).data;
    expect(defaultPreparation).toMatchObject({ projectId: "project-one", itemCount: 0, readyItemCount: 0, netPaise: 0 });
    expect(defaultPreparation.estimateLines).toHaveLength(5);
    expect(defaultPreparation.estimateLines.every((line: { itemIds: string[]; mode: unknown }) => line.itemIds.length === 0 && line.mode === null)).toBe(true);
    expect(defaultRequests).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
    expect(transport.requests.every((request) => request.status === 200 && !request.unexpected)).toBe(true);

    transport.restore();
    transport = installEnterpriseTransport({ route: "/procurement/projects/project-one?qaProcurementModes=ready", role: "procurement", state: "populated" });
    const readyPreparation = (await (await fetch("/api/v1/procurement/projects/project-one/purchase-order-preparation")).json()).data;
    expect(readyPreparation).toMatchObject({ projectId: "project-one", itemCount: 2, readyItemCount: 2, netPaise: 170000 });
    expect(readyPreparation.estimateLines).toHaveLength(5);
    expect(readyPreparation.estimateLines[0].mode.preview).toMatchObject({ mode: "pmc", finalVendorChargesPaise: null });
    expect(readyPreparation.estimateLines[1].mode.state).toBe("exception");
    expect(transport.requests).toEqual([{ method: "GET", path: "/procurement/projects/project-one/purchase-order-preparation", status: 200, unexpected: false }]);
  });
  it("saves and clears only the populated Standard basket's synthetic project rate", async () => {
    const route = "/procurement/projects/project-one?qaStandardBasket=ready";
    const path = "/api/v1/procurement/projects/project-one/baskets/basket-carpentry";
    transport = installEnterpriseTransport({ route, role: "procurement", state: "populated" });
    const initial = (await (await fetch(path)).json()).data;
    expect(initial.standardCost.totalPaise).toBe(135_000);
    expect(initial.lines[0]).toMatchObject({ baseUnitRatePaise: 1_250, projectRate: { version: 0, overridePaise: null } });
    const save = (body: object) => fetch(`${path}/base-rate`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const input = { sourceLineItemKey: "living-room:CA01", baseRatePaise: 1_500, expectedVersion: 0,
      expectedEstimateSource: initial.estimateSource, expectedPreparationDigest: initial.preparationDigest, idempotencyKey: "rate-one" };
    const saved = await save(input);
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({ projectId: "project-one", mainBasketId: "basket-carpentry",
      sourceLineItemKey: input.sourceLineItemKey, projectRate: { version: 1, overridePaise: 1_500 } });
    const updated = (await (await fetch(path)).json()).data;
    expect(updated.lines[0]).toMatchObject({ baseUnitRatePaise: 1_500,
      projectRate: { version: 1, overridePaise: 1_500 }, standardCost: { baseCostPaise: 120_000, adjustedCostPaise: 132_000 } });
    expect(updated.standardCost.totalPaise).toBe(157_000);
    expect(updated.preparationDigest).not.toBe(initial.preparationDigest);
    const list = (await (await fetch("/api/v1/procurement/projects/project-one/baskets")).json()).data;
    expect(list.baskets[0].standardCost.totalPaise).toBe(157_000);
    expect(list.modeGroups[1]).toMatchObject({ mode: "sub_vendor", currentCostPaise: 157_000,
      baskets: [{ id: "basket-carpentry", currentCostPaise: 157_000 }] });
    const stale = await save({ ...input, idempotencyKey: "rate-stale" });
    expect(stale.status).toBe(409);
    const cleared = await save({ ...input, baseRatePaise: null, expectedVersion: 1,
      expectedPreparationDigest: updated.preparationDigest, idempotencyKey: "rate-clear" });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data.projectRate).toEqual({ version: 2, overridePaise: null });
    const afterClear = (await (await fetch(path)).json()).data;
    expect(afterClear.lines[0]).toMatchObject({ baseUnitRatePaise: 1_250, projectRate: { version: 2, overridePaise: null } });
    expect(afterClear.standardCost.totalPaise).toBe(135_000);
    const replay = await save(input);
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.projectRate).toEqual({ version: 1, overridePaise: 1_500 });
    expect(((await (await fetch(path)).json()).data).standardCost.totalPaise).toBe(135_000);
    expect(transport.requests.filter((request) => request.unexpected)).toEqual([]);

    transport.restore();
    transport = installEnterpriseTransport({ route, role: "procurement", state: "mutation-error" });
    expect((await save(input)).status).toBe(422);
  });
  it("opens the designer drawing with the protected image and saved annotation geometry", async () => {
    mount("/designer/design-plans", "designer");
    await userEvent.click(await screen.findByRole("button", { name: "Preview" }));
    const panel = await screen.findByRole("dialog", { name: "Living Room Electrical Plan preview" });
    expect(await within(panel).findByText("Review ceiling alignment")).toBeInTheDocument();
    expect(transport?.requests.some((r) => r.path === "/estimate-design-revisions/revision-estimate-aurora-villa/image" && r.status === 200)).toBe(true);
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
  });
  it("opens client drawing approval and keeps the immutable decision local", async () => {
    mount("/client/projects/project-villa", "client");
    await userEvent.click(await screen.findByText(/Design review/, { selector: "summary" }));
    await userEvent.click(await screen.findByRole("button", { name: "Approve Front elevation" }));
    const dialog = screen.getByRole("dialog", { name: "Approve Front elevation?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm approval" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Synthetic QA");
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
  });
  it("opens the shared client estimate drawing review with nonempty annotation content", async () => {
    mount("/client?estimate=estimate-1", "client");
    await userEvent.click(await screen.findByRole("button", { name: "Preview Living Room Electrical Plan" }));
    const dialog = screen.getByRole("dialog", { name: "Living Room Electrical Plan preview" });
    expect(await within(dialog).findByRole("textbox", { name: "Change summary" })).toBeVisible();
    expect(await within(dialog).findByText("Review ceiling alignment")).toBeInTheDocument();
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
  });
  it("opens the full uploaded plan using its original 1200 by 800 geometry", async () => {
    mount("/client?estimate=estimate-1", "client");
    await userEvent.click(await screen.findByRole("button", { name: "Open uploaded plan Aurora space plan.pdf" }));
    const canvas = await screen.findByTestId("annotation-canvas");
    expect(canvas).toBeInTheDocument();
    expect(transport?.requests.some((r) => r.path === "/client/estimate-plan-pages/page-estimate-1/current-image" && r.status === 200)).toBe(true);
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
  });
  it("serves local SVG crop geometry and a valid protected PDF response", async () => {
    transport = installEnterpriseTransport({ route: "/client/projects/project-villa", role: "client", state: "populated" });
    const image = await fetch("/api/v1/design-section-revisions/revision-2/image");
    expect(image.headers.get("Content-Type")).toBe("image/svg+xml");
    const markup = await image.text();
    expect(markup).toContain('viewBox="10 20 600 400"');
    expect(markup).toContain('aria-labelledby="synthetic-plan-title"');
    expect(markup).toContain('<title id="synthetic-plan-title">Aurora Villa synthetic review plan</title>');
    const pdf = await fetch("/api/v1/design-versions/qa-approved-document/download");
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    const body = await pdf.text();
    expect(body).toMatch(/^%PDF-1.4/);
    const xrefOffset = Number(body.match(/startxref\n(\d+)/)?.[1]);
    expect(body.slice(xrefOffset, xrefOffset + 4)).toBe("xref");
    expect(transport.requests.every((r) => !r.unexpected && r.status === 200)).toBe(true);
  });
  it("loads the approved designer version with matching immutable section records", async () => {
    mount("/designer/projects/project-aurora-villa", "designer");
    expect(await screen.findByText("Sections submitted to the client. This version is read-only.")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Submit sections to client" })).toBeDisabled();
    expect(transport?.requests.some((request) => request.path === "/design-versions/qa-approved-document/sections" && request.status === 200)).toBe(true);
    expect(transport?.requests.filter((request) => request.unexpected)).toEqual([]);
  });
  it("opens the protected read-only workflow document in its contextual panel", async () => {
    mount("/client/projects/project-villa", "client");
    const stage = await screen.findByRole("button", { name: /^Client Kick off —/ });
    if (stage.getAttribute("aria-expanded") !== "true") await userEvent.click(stage);
    const view = await screen.findByRole("button", { name: "View Aurora internal kickoff.pdf" });
    await waitFor(() => expect(view).toBeEnabled());
    await userEvent.click(view);
    const dialog = screen.getByRole("dialog", { name: "Aurora internal kickoff.pdf" });
    expect(within(dialog).getByTitle("Designer’s Internal Kick off document: Aurora internal kickoff.pdf")).toHaveAttribute("src", "blob:synthetic-document");
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
  });
  it.each(["empty", "error", "denied"] as const)("renders the %s state without unregistered traffic", async (state) => {
    const { client } = mount("/admin/projects", "admin", state);
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Unexpected Application Error|Cannot read properties/);
    if (state === "denied") expect(transport?.requests.every((r) => ["/auth/me", "/auth/authorization", "/daily-critical-tasks", "/daily-critical-tasks/current", "/chat/availability"].includes(r.path)), JSON.stringify(transport?.requests)).toBe(true);
  });
  it("keeps stored session data untouched and rejects mutations locally", async () => {
    window.localStorage.setItem("lisno.auth.token", "existing-test-session");
    transport = installEnterpriseTransport({ route: "/admin/dashboard", role: "super_admin", state: "populated" });
    tokenStorage.set("replacement-synthetic");
    tokenStorage.clear();
    expect(window.localStorage.getItem("lisno.auth.token")).toBe("existing-test-session");
    const response = await fetch("/api/v1/projects", { method: "POST", body: "{}" });
    expect(response.status).toBe(422);
    expect(transport.requests).toEqual([{ method: "POST", path: "/projects", status: 422, unexpected: false }]);
  });
  it("serves exact individual and combined In-house previews only for the opt-in QA route", async () => {
    transport = installEnterpriseTransport({
      route: "/admin/configuration/estimation/items/line-1?qaInHouse=ready",
      role: "super_admin",
      state: "populated"
    });
    const labor = { baseRatePaise: 30_000, lowQuantityLimit: "5", impactBps: 1_000,
      minimumMarkupBps: 2_500, startingMarkupBps: 3_500 };
    const material = { baseRatePaise: 70_000, lowQuantityLimit: "2", impactBps: 500,
      minimumMarkupBps: 2_000, startingMarkupBps: 3_000 };
    const request = (body: object) => fetch("/api/v1/admin/ai-estimator-knowledge/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });

    const individual = await request({ modeCalculation: labor, quantity: "1", quantityScale: 2,
      modeCalculationMarkupBasis: "starting", modeCalculationDiscountBps: 500 });
    expect(individual.status).toBe(200);
    expect((await individual.json()).data.modeCalculation).toEqual({
      revisedUnitRatePaise: 33_000,
      revisedAmountPaise: 33_000,
      floorPricePaise: 44_000,
      maximumDiscountBps: 1_333,
      discountBasis: "selling_price",
      totalPaise: 48_231,
      appliedImpactBps: 1_000,
      discount: { rateBps: 500, totalBeforeDiscountPaise: 50_769, amountPaise: 2_538 }
    });

    const combined = await request({ inHouseCalculation: { labor, material }, quantity: "1", quantityScale: 2,
      modeCalculationMarkupBasis: "starting", modeCalculationDiscountBps: 500 });
    expect(combined.status).toBe(200);
    expect((await combined.json()).data.inHouseCalculation).toMatchObject({
      labor: { maximumDiscountBps: 1_333, totalPaise: 48_231 },
      material: { maximumDiscountBps: 1_250, totalPaise: 99_750 },
      totalPaise: 147_981
    });
    expect(transport.requests).toEqual([
      { method: "POST", path: "/admin/ai-estimator-knowledge/preview", status: 200, unexpected: false },
      { method: "POST", path: "/admin/ai-estimator-knowledge/preview", status: 200, unexpected: false }
    ]);
  });
  it("makes unexpected GET requests visible without passing them to a backend", async () => {
    transport = installEnterpriseTransport({ route: "/admin/dashboard", role: "super_admin", state: "populated" });
    expect((await fetch("/api/v1/unregistered")).status).toBe(501);
    expect(screen.getByRole("alert")).toHaveTextContent("blocked unexpected request");
  });
  it("blocks native upload transport and surfaces the upload error", async () => {
    server.close();
    try {
    transport = installEnterpriseTransport({ route: "/admin/dashboard", role: "super_admin", state: "populated" });
    const xhr = new XMLHttpRequest();
    const onerror = vi.fn(); xhr.onerror = onerror;
    xhr.open("POST", "/api/v1/upload"); xhr.setRequestHeader("Authorization", "synthetic"); xhr.send(new FormData());
    await waitFor(() => expect(onerror).toHaveBeenCalledOnce());
    expect(transport.requests[0]).toMatchObject({ status: 0, path: "/api/v1/upload" });
    } finally {
      transport?.restore(); transport = undefined;
      server.listen({ onUnhandledRequest: "error" });
    }
  });
});


describe("Procurement mode group browser scenario", () => {
  it("opts in to mixed groups with all category photos while preserving existing Standard fixtures", async () => {
    transport = installEnterpriseTransport({ route: "/procurement/projects/project-one?qaProcurementGroups=ready", role: "procurement", state: "populated" });
    const list = (await (await fetch("/api/v1/procurement/projects/project-one/baskets")).json()).data as ProcurementBasketList;
    expect(hasValidProcurementModeGroups(list)).toBe(true);
    expect(list.baskets).toHaveLength(19);
    expect(list.modeGroups!.map((group) => [group.mode, group.basketCount, group.includedLineCount])).toEqual([
      ["in_house", 6, 6], ["sub_vendor", 6, 7], ["pmc", 8, 8], ["unrecorded", 1, 1]
    ]);
    expect(list.modeGroups![0]!.currentCostPaise).toBeNull();
    expect(list.modeGroups![1]!.currentCostPaise).toBe(124_000);
    expect(list.modeGroups![2]!.currentCostPaise).toBe(172_000);
    expect(list.baskets.filter((basket) => basket.name === "POP / Gypsum").map((basket) => basket.id)).toEqual(["basket-mixed", "basket-duplicate"]);
    const detail = (await (await fetch("/api/v1/procurement/projects/project-one/baskets/basket-mixed")).json()).data as ProcurementBasketDetail;
    expect(detail.lines.map((line) => [line.estimateMode?.approvedClassification, line.estimateMode?.mode])).toEqual([
      ["standard", "sub_vendor"], ["special", "sub_vendor"], ["special", "in_house"], ["special", "pmc"]
    ]);
    expect(detail.lines.every((line) => line.mode?.decision?.mode === "pmc")).toBe(true);
    expect(transport.requests.every((request) => request.method === "GET" && !request.unexpected)).toBe(true);
    transport.restore();
    transport = installEnterpriseTransport({ route: "/procurement/projects/project-one?qaStandardBasket=ready", role: "procurement", state: "populated" });
    const standard = (await (await fetch("/api/v1/procurement/projects/project-one/baskets")).json()).data as ProcurementBasketList;
    expect(standard.baskets).toHaveLength(1);
    expect(standard.baskets[0]?.id).toBe("basket-carpentry");
    expect(standard.modeGroups![1]!.currentCostPaise).toBe(135_000);
    expect(hasValidProcurementModeGroups(standard)).toBe(true);
  });

  it("returns three empty groups only for the empty opted-in scenario", async () => {
    transport = installEnterpriseTransport({ route: "/procurement/projects/project-one?qaProcurementGroups=ready", role: "procurement", state: "empty" });
    const list = (await (await fetch("/api/v1/procurement/projects/project-one/baskets")).json()).data as ProcurementBasketList;
    expect(list.baskets).toEqual([]);
    expect(hasValidProcurementModeGroups(list)).toBe(true);
    expect(list.modeGroups!.map((group) => [group.basketCount, group.currentCostPaise, group.readinessPercent])).toEqual([
      [0, 0, null], [0, 0, null], [0, 0, null]
    ]);
  });
});

describe("Procurement project gallery browser scenario", () => {
  it("keeps unequal gallery records opt-in and reconciles them with real posted expense lineage", async () => {
    transport = installEnterpriseTransport({ route: "/procurement?qaProcurementGallery=ready", role: "procurement", state: "populated" });
    const projects = (await (await fetch("/api/v1/procurement/projects")).json()).data as ProcurementProject[];
    expect(projects.map((project) => [project.projectId, project.taskStatus, project.clientName])).toEqual([
      ["project-one", "in_progress", "Asha Rao"],
      ["project-gallery-north", "open", "Dev Mehta and Kavya Mehta"],
      ["project-gallery-cedar", "completed", null]
    ]);
    expect(procurementProjectsIntegrityError(projects)).toBeNull();
    expect(projects.map((project) => project.sections.reduce((sum, section) => sum + section.estimatedAmountPaise, 0)))
      .toEqual([197_000, 8_500_000, 8_000]);
    expect(projects.map((project) => project.sections.reduce((sum, section) => sum + section.actualSpendPaise, 0)))
      .toEqual([125_000, 8_500_000, 12_500]);
    const list = (await (await fetch("/api/v1/procurement/projects/project-one/baskets")).json()).data as ProcurementBasketList;
    expect(hasValidProcurementModeGroups(list)).toBe(true);
    expect(list.baskets).toHaveLength(3);
    expect(list.baskets.reduce((sum, basket) => sum + basket.approvedEstimatePaise, 0)).toBe(197_000);
    expect(list.estimateSource).toMatchObject({ estimateId: projects[0]!.estimateId, estimateVersion: projects[0]!.estimateVersion });
    expect(transport.requests.every((request) => request.method === "GET" && !request.unexpected)).toBe(true);

    transport.restore();
    transport = installEnterpriseTransport({ route: "/procurement", role: "procurement", state: "populated" });
    const normal = (await (await fetch("/api/v1/procurement/projects")).json()).data as ProcurementProject[];
    expect(normal).toHaveLength(1);
    expect(normal[0]!.sections.reduce((sum, section) => sum + section.estimatedAmountPaise, 0)).toBe(375_000);
  });

  it.each(["/procurement", "/home"])("renders %s with local filters and navigates by project ID into the full mixed-mode basket", async (path) => {
    // React Router creates native Requests on navigation; align their signal with Node's runtime.
    const controller = transferableAbortController();
    vi.stubGlobal("AbortController", controller.constructor);
    vi.stubGlobal("AbortSignal", controller.signal.constructor);
    const { client, router } = mount(`${path}?qaProcurementGallery=ready`, "procurement");
    const workspace = await screen.findByRole("region", { name: "Procurement" });
    await within(workspace).findByRole("article", { name: "Aurora Villa" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const before = [...transport!.requests];
    await userEvent.type(within(workspace).getByRole("searchbox", { name: "Search projects" }), "  AuRoRa  ");
    await userEvent.selectOptions(within(workspace).getByRole("combobox", { name: "Project status" }), "in_progress");
    expect(within(workspace).getAllByRole("article")).toHaveLength(1);
    expect(within(workspace).getByRole("region", { name: "Procurement portfolio summary" })).toHaveTextContent("₹87,050.00");
    expect(transport!.requests).toEqual(before);
    await userEvent.click(within(workspace).getByRole("link", { name: "View procurement items for Aurora Villa" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/procurement/projects/project-one"));
    const card = await screen.findByRole("button", { name: "Open POP / Gypsum in PMC" });
    await userEvent.click(card);
    expect(await screen.findByText("PMC ceiling supervision")).toBeVisible();
    expect(screen.getByText("Standard POP finish")).toBeVisible();
    expect(screen.getByText("Special cove finish")).toBeVisible();
    expect(screen.getByText("In-house ceiling trim")).toBeVisible();
    expect(router.state.location.search).toContain("basket=basket-mixed");
    expect(transport!.requests.filter((request) => request.unexpected)).toEqual([]);
    expect(transport!.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("offers a separate valid long-currency scenario without changing default screenshots", async () => {
    transport = installEnterpriseTransport({ route: "/procurement?qaProcurementGallery=large", role: "procurement", state: "populated" });
    const projects = (await (await fetch("/api/v1/procurement/projects")).json()).data as ProcurementProject[];
    expect(procurementProjectsIntegrityError(projects)).toBeNull();
    expect(projects[1]!.sections[0]!.estimatedAmountPaise).toBe(123_456_789_012);
    expect(projects[1]!.sections[0]!.actualSpendPaise).toBe(123_456_789_012);
  });
});
