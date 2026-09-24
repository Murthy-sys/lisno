import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionCode, Role } from "../../api/authorization-contract";
import type { ProcurementVendorReference } from "../../api/types";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { completeVendor, vendorBasket, vendorSubBasket } from "./vendorProfile.fixtures";
import { ProcurementManagementPage } from "./ProcurementManagementPage";
import { ProcurementVendorField } from "./ProcurementVendorField";
import { getVendorSuggestions, vendorSuggestionKeys, type VendorSuggestion, type VendorSuggestionProject } from "./vendorSuggestionsApi";

let role: Role = "admin";
let permissions: readonly PermissionCode[] | undefined;
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "manager-one", name: "Manager One", role }, authorization: authorizationFor(role, permissions) }) }));
const project: VendorSuggestionProject = { projectId: "project-one", projectName: "Aurora Villa", estimateId: "estimate-one", estimateVersion: 3, designPlanVersion: 2 };
const vendor: ProcurementVendorReference = { id: "vendor-one", name: "Timber House", code: "TIMBER", status: "active" };
const saved: VendorSuggestion = { ...project, id: "suggestion-one", estimateReviewRoundId: "round-one", vendor, note: "Reliable delivery", status: "suggested", version: 1, suggestedBy: { id: "manager-one", name: "Manager One" }, updatedBy: { id: "manager-one", name: "Manager One" }, createdAt: "2026-09-18T00:00:00Z", updatedAt: "2026-09-18T00:00:00Z", kpi: { status: "not_rated", score: null } };
const master = { ...vendor, masterType: "vendors", description: "Timber supply", displayOrder: 1, version: 3, createdById: "sa", updatedById: "sa", createdAt: saved.createdAt, updatedAt: saved.updatedAt };
let currentProject = project;
let suggestions: VendorSuggestion[] = [];
const data = (value: unknown, status = 200) => HttpResponse.json({ data: value }, { status });
const suggestionPage = (items = suggestions, source = currentProject) => data({ project: source, items, total: items.length, offset: 0, limit: 20, performance: { status: "not_available", recommendations: [] } });
function start() {
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return <ProcurementManagementPage />; }
  return { ...renderWithQuery(<Capture />), client };
}
async function openPanel() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Suggest vendors for Aurora Villa" }));
  await screen.findByText("No vendors suggested for this Design yet.");
  return user;
}
async function chooseVendor(user: ReturnType<typeof userEvent.setup>) {
  const combo = screen.getByRole("combobox", { name: "Vendor" });
  await user.click(combo);
  await user.click(await screen.findByRole("option", { name: "Timber House" }));
}
beforeEach(() => {
  role = "admin"; permissions = undefined; currentProject = project; suggestions = [];
  server.use(
    http.get("/api/v1/procurement/suggestion-projects", () => data({ items: [currentProject], total: 1, limit: 20, offset: 0 })),
    http.get("/api/v1/procurement/projects/project-one/vendor-suggestions", () => suggestionPage()),
    http.get("/api/v1/procurement/vendors", () => data({ items: [vendor], total: 1, limit: 20, offset: 0 })),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => data({ items: [vendorBasket], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } })),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets/basket-one/sub-baskets", () => data({ items: [vendorSubBasket], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } })),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one", () => data({ ...completeVendor, version: 3 })),
    http.get("/api/v1/admin/ai-estimator-knowledge/vendors", () => data({ items: [master], pagination: { total: 1, limit: 20, offset: 0, hasMore: false } }))
  );
});
describe("vendor procurement", () => {
  it("lets a manager submit a source-bound suggestion and locks fields during the request", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const writes: unknown[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/vendor-suggestions", async ({ request }) => { writes.push(await request.json()); await pending; suggestions = [saved]; return data(saved, 201); }));
    start(); const user = await openPanel(); await chooseVendor(user);
    await user.type(screen.getByRole("textbox", { name: "Why suggest this vendor?" }), saved.note);
    await user.click(screen.getByRole("button", { name: "Suggest vendor" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.getByRole("textbox", { name: "Why suggest this vendor?" })).toBeDisabled();
    expect(writes[0]).toEqual({ estimateId: project.estimateId, estimateVersion: 3, designPlanVersion: 2, vendorId: vendor.id, note: saved.note, idempotencyKey: expect.any(String) });
    await act(async () => release());
    expect(await screen.findByText("Vendor suggestion saved.")).toBeVisible();
    expect(screen.getByText("Reliable delivery")).toBeVisible();
    expect(screen.getByText(/KPI is not rated yet/)).toBeVisible();
  });
  it("retains the same idempotency key after a transient failure", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/vendor-suggestions", async ({ request }) => {
      bodies.push(await request.json() as Record<string, unknown>);
      return bodies.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Try again" } }, { status: 500 }) : data(saved);
    }));
    start(); const user = await openPanel(); await chooseVendor(user);
    await user.click(screen.getByRole("button", { name: "Suggest vendor" }));
    await screen.findByText("Try again");
    expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveValue(vendor.name);
    await user.click(screen.getByRole("button", { name: "Suggest vendor" }));
    await screen.findByText("Vendor suggestion saved.");
    expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
  });
  it("edits and withdraws a saved suggestion with its expected version", async () => {
    suggestions = [saved]; const writes = vi.fn();
    server.use(http.patch("/api/v1/procurement/projects/project-one/vendor-suggestions/suggestion-one", async ({ request }) => {
      const body = await request.json() as { note: string; status: VendorSuggestion["status"] }; writes(body); suggestions = [{ ...saved, ...body, version: 2 }]; return data(suggestions[0]);
    }));
    start(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Suggest vendors for Aurora Villa" }));
    await user.click(await screen.findByRole("button", { name: "Edit suggestion for Timber House" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Suggestion status" }), "withdrawn");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText(/Withdrawn by Manager One/);
    expect(writes).toHaveBeenCalledWith({ expectedVersion: 1, note: saved.note, status: "withdrawn" });
  });
  it("keeps draft on source conflict and refreshes the eligible project version", async () => {
    const view = start(); const user = await openPanel(); await chooseVendor(user);
    await user.type(screen.getByRole("textbox", { name: "Why suggest this vendor?" }), "Keep this draft");
    currentProject = { ...project, designPlanVersion: 5 };
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorSuggestionKeys.project(project.projectId) }); });
    await screen.findByText(/The approved Design changed/);
    expect(screen.getByRole("textbox", { name: "Why suggest this vendor?" })).toHaveValue("Keep this draft");
    expect(screen.getByRole("button", { name: "Suggest vendor" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.getByText("Estimate v3 · Design v5")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Suggest vendors for Aurora Villa" }));
    await screen.findByText("No vendors suggested for this Design yet.");
    expect(screen.getByRole("button", { name: "Suggest vendor" })).toBeEnabled();
  });
  it("preserves draft and blocks stale save after a CAS conflict", async () => {
    server.use(http.post("/api/v1/procurement/projects/project-one/vendor-suggestions", () => HttpResponse.json({ error: { code: "VENDOR_SUGGESTION_DUPLICATE", message: "Vendor already suggested" } }, { status: 409 })));
    start(); const user = await openPanel(); await chooseVendor(user);
    await user.type(screen.getByRole("textbox", { name: "Why suggest this vendor?" }), "Retain my context");
    await user.click(screen.getByRole("button", { name: "Suggest vendor" }));
    await screen.findByText(/Vendor already suggested/);
    expect(screen.getByRole("textbox", { name: "Why suggest this vendor?" })).toHaveValue("Retain my context");
    expect(screen.getByRole("button", { name: "Suggest vendor" })).toBeDisabled();
  });
  it("uses the shared Super Admin vendor editor and archives with a reason and version", async () => {
    role = "super_admin"; const writes = vi.fn();
    server.use(http.delete("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one", async ({ request }) => { writes(await request.json()); return data({ ...master, status: "archived", version: 4 }); }));
    start(); const user = userEvent.setup();
    expect(await screen.findByRole("rowheader", { name: /Timber House/ })).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("Not available")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit Timber House" }));
    expect(await screen.findByRole("textbox", { name: "Entity Name" })).toHaveValue("Timber House");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Archive Timber House" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Existing project records remain available.");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "No longer supplying");
    await user.click(within(dialog).getByRole("button", { name: "Archive vendor" }));
    await screen.findByText("Timber House archived.");
    expect(writes).toHaveBeenCalledWith({ expectedVersion: 3, reason: "No longer supplying" });
  });
  it("updates a complete configured vendor availability using CAS", async () => {
    role = "super_admin"; const writes: unknown[] = [];
    server.use(http.patch("/api/v1/admin/ai-estimator-knowledge/vendors/vendor-one", async ({ request }) => { const body = await request.json() as Record<string, unknown>; writes.push(body); return data({ ...master, ...body, version: 4 }); }));
    start(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit Timber House" }));
    const panel = await screen.findByRole("dialog", { name: "Vendor details" });
    await user.selectOptions(await within(panel).findByRole("combobox", { name: "Status" }), "inactive");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Timber House saved.");
    expect(writes[0]).toMatchObject({ expectedVersion: 3, status: "inactive", name: "Timber House", procurementProfile: { vendorType: "execution", executionType: ["labor"] } });
  });
  it("sends classification filters and resets pagination when they change", async () => {
    role = "super_admin"; const requests: URLSearchParams[] = [];
    server.use(http.get("/api/v1/admin/ai-estimator-knowledge/vendors", ({ request }) => { const params = new URL(request.url).searchParams; requests.push(params); return data({ items: [master], pagination: { total: 41, offset: Number(params.get("offset")), limit: 20, hasMore: true } }); }));
    start(); const user = userEvent.setup(); await screen.findByRole("rowheader", { name: /Timber House/ });
    await user.click(screen.getByRole("button", { name: "Next" })); await waitFor(() => expect(requests.at(-1)?.get("offset")).toBe("5"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Type" }), "supplier");
    await waitFor(() => expect(requests.at(-1)?.get("vendorType")).toBe("supplier")); expect(requests.at(-1)?.get("offset")).toBe("0");
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), "basket-one"); await screen.findByRole("option", { name: vendorSubBasket.name });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sub Basket" }), "sub-one"); await waitFor(() => expect(requests.at(-1)?.get("subBasketId")).toBe("sub-one"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Main Basket" }), ""); await waitFor(() => expect(requests.at(-1)?.has("subBasketId")).toBe(false));
    expect(screen.getByRole("combobox", { name: "Sub Basket" })).toBeDisabled();
  });
  it("blocks a failed refresh without discarding the manager draft", async () => {
    const view = start(); const user = await openPanel(); await chooseVendor(user);
    await user.type(screen.getByRole("textbox", { name: "Why suggest this vendor?" }), "Keep delivery context");
    server.use(http.get("/api/v1/procurement/projects/project-one/vendor-suggestions", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Access changed" } }, { status: 403 })));
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorSuggestionKeys.project(project.projectId) }); });
    await screen.findByText(/Access changed/);
    expect(screen.getByRole("textbox", { name: "Why suggest this vendor?" })).toHaveValue("Keep delivery context");
    expect(screen.getByRole("button", { name: "Suggest vendor" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Saved vendor suggestions" })).not.toBeInTheDocument();
  });
  it.each(["client", "estimator_sales", "procurement"] as const)("denies management workspace to %s without requests", (other) => {
    role = other; const fetch = vi.spyOn(globalThis, "fetch"); start();
    expect(screen.getByText(/do not have permission/)).toBeVisible(); expect(fetch).not.toHaveBeenCalled();
  });
  it("denies a manager missing the read permission", () => { permissions = []; const fetch = vi.spyOn(globalThis, "fetch"); start(); expect(screen.getByText(/do not have permission/)).toBeVisible(); expect(fetch).not.toHaveBeenCalled(); });
  it("only selects active current suggestions and isolates different project results", async () => {
    role = "procurement";
    suggestions = [saved, { ...saved, id: "withdrawn", vendor: { ...vendor, id: "vendor-two", name: "Withdrawn vendor" }, status: "withdrawn" }, { ...saved, id: "inactive", vendor: { ...vendor, id: "vendor-three", name: "Inactive vendor", status: "inactive" } }];
    const other = { ...project, projectId: "project-two", estimateId: "estimate-two" };
    server.use(http.get("/api/v1/procurement/projects/project-two/vendor-suggestions", () => suggestionPage([{ ...saved, ...other, vendor: { ...vendor, id: "vendor-four", name: "Stone Studio" } }], other)));
    function Picker({ projectId }: { projectId: string }) { const [value, setValue] = useState<ProcurementVendorReference | null>(null); return <ProcurementVendorField projectId={projectId} value={value} onChange={setValue} onBusyChange={() => {}} onUnresolvedChange={() => {}} />; }
    const view = renderWithQuery(<Picker projectId="project-one" />); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Use Timber House" }));
    expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveValue("Timber House");
    expect(screen.queryByRole("button", { name: /Use (Withdrawn|Inactive)/ })).not.toBeInTheDocument();
    view.unmount(); renderWithQuery(<Picker projectId="project-two" />);
    expect(await screen.findByRole("button", { name: "Use Stone Studio" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Use Timber House" })).not.toBeInTheDocument();
  });
  it("rejects mismatched project response identities", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/vendor-suggestions", () => suggestionPage([{ ...saved, projectId: "project-two" }])));
    await expect(getVendorSuggestions("project-one")).rejects.toThrow(/do not match/);
  });
});
