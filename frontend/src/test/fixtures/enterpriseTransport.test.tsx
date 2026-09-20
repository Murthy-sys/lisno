import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AppRoutes } from "../../app/router";
import { AuthProvider } from "../../auth/AuthProvider";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { server } from "../server";
import { tokenStorage } from "../../api/client";
import type { Role } from "../../api/types";
import { installEnterpriseTransport, type EnterpriseScenario } from "./enterpriseTransport";

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
  ["/home", "procurement"], ["/procurement/projects/project-one", "procurement"], ["/home", "worker_electrician"], ["/home", "site_manager"],
  ["/admin/configuration/estimation", "super_admin"], ["/admin/configuration/estimation/items/line-1", "super_admin"], ["/admin/configuration/estimation/reusable-values", "super_admin"]
];
describe("synthetic enterprise route harness", () => {
  it.each(routes)("renders %s as %s with only registered mock reads", async (route, role) => {
    const { client } = mount(route, role);
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(transport?.requests.filter((r) => r.unexpected)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Unexpected Application Error|Synthetic QA render failed|Cannot read properties/);
    expect(document.querySelector("main")).toBeTruthy();
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
    if (state === "denied") expect(transport?.requests.every((r) => r.path.startsWith("/auth/"))).toBe(true);
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
