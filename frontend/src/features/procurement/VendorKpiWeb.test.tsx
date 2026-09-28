import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionCode, Role } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { VendorKpiAssessment, VendorKpiPublicInspection, VendorKpiStaffDetail } from "../../../../shared/knowledge/vendorKpi";
import { VendorKpiStaffPage } from "./VendorKpiStaffPage";
import { VendorKpiPublicPage } from "./VendorKpiPublicPage";
import { vendorKpiKeys } from "./vendorKpiApi";
import { captureVendorKpiTokenBeforeRouterMount } from "./vendorKpiTokenVault";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const data = (value: unknown) => HttpResponse.json({ data: value });
const denied = () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Access revoked" } }, { status: 403 });
let role: Role = "procurement";
let permissions: readonly PermissionCode[] | undefined;
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: role === "procurement" ? "staff-a" : "staff-b", name: "Staff", role }, authorization: authorizationFor(role, permissions) }) }));

const base: VendorKpiStaffDetail = {
  vendor: { id: "vendor-one", code: "TIMBER", name: "Timber House", status: "active", vendorType: "execution", workProfile: "Cabinetry", mainBasketNames: ["Carpentry"], subBasketNames: ["Cabinets"], emailAvailable: true },
  rubricVersion: 1, selfAssessment: null, procurementAssessment: null, officialScoreBps: null,
  request: null, requestEligibility: "ready"
};
const assessment: VendorKpiAssessment = {
  id: "assessment-one", vendorId: "vendor-one", source: "procurement", vendorType: "execution", rubricVersion: 1,
  scores: [{ key: "timeline", score: 90 }, { key: "quality", score: 95 }, { key: "budget", score: 85 }, { key: "site_discipline", score: 90 }],
  averageScoreBps: 9000, revision: 1, comment: null, submittedAt: "2026-09-28T00:00:00.000Z"
};
const publicVendor: VendorKpiPublicInspection["vendor"] = {
  name: "Sample Supplier", vendorType: "supplier", workProfile: "Supply",
  representativeName: "Asha Demo", representativePosition: "Owner"
};

function staff() {
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return <VendorKpiStaffPage />; }
  const path = role === "super_admin" ? "/admin/procurement/vendors/vendor-one" : "/procurement/vendors/vendor-one";
  const view = renderWithQuery(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/procurement/vendors/:vendorId" element={<Capture />} /><Route path="/procurement/vendors/:vendorId" element={<Capture />} /></Routes></MemoryRouter>);
  return { ...view, get client() { return client; } };
}
function publicPage() {
  window.history.replaceState(null, "", `/vendor-kpi#token=${token}`);
  captureVendorKpiTokenBeforeRouterMount();
  return renderWithQuery(<VendorKpiPublicPage />);
}

beforeEach(() => {
  role = "procurement"; permissions = undefined;
  window.history.replaceState(null, "", "/");
  captureVendorKpiTokenBeforeRouterMount();
  server.use(http.get("/api/v1/procurement/vendor-kpis/vendor-one", () => data(base)));
});

describe("staff vendor KPI", () => {
  it.each(["procurement", "super_admin"] as const)("shows role-specific vendor detail and saves an official score for %s", async (actor) => {
    role = actor;
    const writes: unknown[] = [];
    server.use(http.put("/api/v1/procurement/vendor-kpis/vendor-one/procurement", async ({ request }) => {
      writes.push(await request.json());
      return data({ ...base, procurementAssessment: assessment, officialScoreBps: 9000 });
    }));
    staff(); const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Timber House" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to vendors" })).toHaveAttribute("href", actor === "super_admin" ? "/admin/procurement/vendors" : "/procurement/vendors");
    expect(screen.getByText("Not rated")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save Procurement KPI" }));
    expect(screen.getByRole("spinbutton", { name: /Timeline/ })).toHaveFocus();
    expect(screen.getAllByText("Enter a rating from 0 to 100.")).toHaveLength(4);
    for (const [label, score] of [["Timeline", "90"], ["Quality", "95"], ["Budget", "85"], ["Site discipline (reports and people on time)", "90"]] as const) await user.type(screen.getByRole("spinbutton", { name: label }), score);
    await user.click(screen.getByRole("button", { name: "Save Procurement KPI" }));
    expect(await screen.findByText("Procurement KPI saved.")).toBeVisible();
    expect(screen.getByText("90/100")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ expectedRevision: null, rubricVersion: 1, scores: assessment.scores });
  });

  it("keeps vendor self score separate and sends a request only with permission", async () => {
    const requests: unknown[] = [];
    server.use(http.post("/api/v1/procurement/vendor-kpis/vendor-one/requests", async ({ request }) => {
      requests.push(await request.json());
      return data({ ...base, request: { status: "sent", version: 1, requestedAt: "2026-09-28T00:00:00Z", expiresAt: "2026-09-29T00:00:00Z", sentAt: "2026-09-28T00:00:00Z", canResendAt: null }, requestEligibility: "pending" });
    }));
    staff(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Request KPI from vendor" }));
    expect(await screen.findByText(/Vendor request: sent/)).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(screen.getByText("Not rated")).toBeVisible();
  });

  it("reports a saved failed-delivery state without claiming an email was sent", async () => {
    server.use(http.post("/api/v1/procurement/vendor-kpis/vendor-one/requests", () => data({
      ...base,
      request: { status: "failed", version: 1, requestedAt: "2026-09-28T00:00:00Z", expiresAt: "2026-09-29T00:00:00Z", sentAt: null, canResendAt: null },
      requestEligibility: "ready"
    })));
    staff(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Request KPI from vendor" }));
    expect(await screen.findByText("Email delivery failed. You can retry the KPI request.")).toBeVisible();
    expect(screen.getByText(/Vendor request: failed/)).toBeVisible();
    expect(screen.queryByText("KPI request sent to the vendor profile email.")).not.toBeInTheDocument();
  });

  it("refreshes an external self submission without turning it into the official score", async () => {
    const self: VendorKpiAssessment = { ...assessment, id: "self-one", source: "vendor_self", averageScoreBps: 9000 };
    let current: VendorKpiStaffDetail = base;
    server.use(http.get("/api/v1/procurement/vendor-kpis/vendor-one", () => data(current)));
    staff(); const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: "Request KPI from vendor" })).toBeVisible();
    current = { ...base, selfAssessment: self, requestEligibility: "self_submitted" };
    await user.click(screen.getByRole("button", { name: "Refresh KPI" }));
    const selfPanel = await screen.findByRole("region", { name: "Vendor self rating" });
    expect(within(selfPanel).getByText("90/100")).toBeVisible();
    expect(screen.getByText("Not rated")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request KPI from vendor" })).not.toBeInTheDocument();
  });

  it("uses a new staff idempotency key when scores change after an uncertain response", async () => {
    const writes: Array<{ idempotencyKey: string; scores: Array<{ key: string; score: number }> }> = [];
    server.use(http.put("/api/v1/procurement/vendor-kpis/vendor-one/procurement", async ({ request }) => {
      writes.push(await request.json() as typeof writes[number]);
      return writes.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Try again" } }, { status: 503 }) : data({ ...base, procurementAssessment: assessment, officialScoreBps: 9000 });
    }));
    staff(); const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Timber House" });
    for (const label of ["Timeline", "Quality", "Budget", "Site discipline (reports and people on time)"]) await user.type(screen.getByRole("spinbutton", { name: label }), "85");
    await user.click(screen.getByRole("button", { name: "Save Procurement KPI" }));
    expect(await screen.findByText("Try again")).toBeVisible();
    const timeline = screen.getByRole("spinbutton", { name: "Timeline" });
    await user.clear(timeline); await user.type(timeline, "90");
    await user.click(screen.getByRole("button", { name: "Save Procurement KPI" }));
    expect(await screen.findByText("Procurement KPI saved.")).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[0].scores.find(({ key }) => key === "timeline")?.score).toBe(85);
    expect(writes[1].scores.find(({ key }) => key === "timeline")?.score).toBe(90);
    expect(writes[1].idempotencyKey).not.toBe(writes[0].idempotencyKey);
  });

  it("fails closed on direct permission loss and a denied refetch", async () => {
    permissions = ["procurement.vendor_directory.read"];
    const fetch = vi.spyOn(globalThis, "fetch");
    const deniedView = staff();
    expect(screen.getByText("You do not have permission to view this vendor KPI.")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
    deniedView.unmount();
    permissions = undefined;
    const view = staff();
    expect(await screen.findByRole("heading", { name: "Timber House" })).toBeVisible();
    server.use(http.get("/api/v1/procurement/vendor-kpis/vendor-one", denied));
    await act(async () => { await view.client.invalidateQueries({ queryKey: vendorKpiKeys.detail("staff-a", "vendor-one") }); });
    expect(await screen.findByText("You do not have permission to view this vendor KPI.")).toBeVisible();
    expect(screen.queryByText("Cabinetry")).not.toBeInTheDocument();
  });
});

describe("one-time public vendor form", () => {
  it("scrubs token before rendering, validates supplier categories, and submits self score", async () => {
    const inspected: unknown[] = []; const submitted: unknown[] = [];
    server.use(
      http.post("/api/v1/vendor-kpi/inspect", async ({ request }) => { inspected.push(await request.json()); return data({ vendor: { ...publicVendor, code: "SUP-1", mainBasketNames: ["Fixtures"], subBasketNames: ["Hardware"] }, rubricVersion: 1, expiresAt: "2099-01-01T00:00:00Z" }); }),
      http.post("/api/v1/vendor-kpi/submit", async ({ request }) => { submitted.push(await request.json()); return data({ averageScoreBps: 8600, submittedAt: "2026-09-28T00:00:00Z" }); })
    );
    publicPage(); const user = userEvent.setup();
    expect(window.location.href).not.toContain(token);
    expect(await screen.findByRole("heading", { name: "Vendor self assessment" })).toBeVisible();
    expect(await screen.findByText("Sample Supplier")).toBeVisible();
    const details = screen.getByRole("region", { name: "Vendor details" });
    expect(within(details).getByText("Vendor name")).toBeVisible();
    expect(within(details).getByText("Vendor type")).toBeVisible();
    expect(within(details).getByText("Supplier")).toBeVisible();
    expect(within(details).getByText("Work profile")).toBeVisible();
    expect(within(details).getByText("Supply")).toBeVisible();
    expect(within(details).getByText("Representative")).toBeVisible();
    expect(within(details).getByText("Asha Demo")).toBeVisible();
    expect(within(details).getByText("Position")).toBeVisible();
    expect(within(details).getByText("Owner")).toBeVisible();
    expect(within(details).queryByText("SUP-1")).not.toBeInTheDocument();
    expect(within(details).queryByText(/basket/i)).not.toBeInTheDocument();
    expect(within(details).queryByText("Fixtures")).not.toBeInTheDocument();
    expect(screen.queryByText("Procurement rating")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save Vendor KPI" }));
    expect(screen.getByRole("spinbutton", { name: /Rates offered/ })).toHaveFocus();
    const form = screen.getByRole("form", { name: "Your self rating" });
    for (const label of ["Rates offered", "Service communication", "Delivery coordination", "Defect liability addressal", "Commitment to timelines"]) await user.type(within(form).getByRole("spinbutton", { name: label }), "86");
    await user.click(screen.getByRole("button", { name: "Save Vendor KPI" }));
    expect(await screen.findByRole("heading", { name: "Assessment saved" })).toBeVisible();
    expect(inspected).toEqual([{ token }]);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ token, rubricVersion: 1, scores: expect.arrayContaining([{ key: "rates_offered", score: 86 }]) });
    expect(window.location.href).not.toContain(token);
  });

  it("shows a neutral unavailable state without disclosing vendor details", async () => {
    server.use(http.post("/api/v1/vendor-kpi/inspect", denied));
    publicPage();
    expect(await screen.findByText(/assessment link is unavailable/)).toBeVisible();
    expect(screen.queryByText("Timber House")).not.toBeInTheDocument();
    expect(window.location.href).not.toContain(token);
  });

  it("labels missing representative details without adding internal vendor fields", async () => {
    server.use(http.post("/api/v1/vendor-kpi/inspect", () => data({
      vendor: { ...publicVendor, vendorType: "execution", representativeName: "", representativePosition: "" },
      rubricVersion: 1, expiresAt: "2099-01-01T00:00:00Z"
    })));
    publicPage();
    const details = await screen.findByRole("region", { name: "Vendor details" });
    expect(within(details).getByText("Execution vendor")).toBeVisible();
    expect(within(details).getAllByText("Not recorded")).toHaveLength(2);
    expect(within(details).queryByText(/basket|SUP-1/i)).not.toBeInTheDocument();
  });

  it("generates a submission key when crypto.randomUUID is unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, "randomUUID");
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
    try {
      let submitted: Record<string, unknown> | null = null;
      server.use(
        http.post("/api/v1/vendor-kpi/inspect", () => data({ vendor: publicVendor, rubricVersion: 1, expiresAt: "2099-01-01T00:00:00Z" })),
        http.post("/api/v1/vendor-kpi/submit", async ({ request }) => { submitted = await request.json() as Record<string, unknown>; return data({ averageScoreBps: 8600, submittedAt: "2026-09-28T00:00:00Z" }); })
      );
      publicPage(); const user = userEvent.setup();
      await screen.findByText("Sample Supplier");
      for (const label of ["Rates offered", "Service communication", "Delivery coordination", "Defect liability addressal", "Commitment to timelines"]) await user.type(screen.getByRole("spinbutton", { name: label }), "86");
      await user.click(screen.getByRole("button", { name: "Save Vendor KPI" }));
      expect(await screen.findByRole("heading", { name: "Assessment saved" })).toBeVisible();
      expect(submitted).not.toBeNull();
      expect((submitted as Record<string, unknown> | null)?.idempotencyKey).toEqual(expect.stringMatching(/^procurement-\d+-/));
    } finally {
      if (descriptor) Object.defineProperty(globalThis.crypto, "randomUUID", descriptor);
      else delete (globalThis.crypto as { randomUUID?: () => string }).randomUUID;
    }
  });

  it("sends edited self scores with a fresh key after an uncertain response", async () => {
    const writes: Array<{ idempotencyKey: string; scores: Array<{ key: string; score: number }> }> = [];
    server.use(
      http.post("/api/v1/vendor-kpi/inspect", () => data({ vendor: publicVendor, rubricVersion: 1, expiresAt: "2099-01-01T00:00:00Z" })),
      http.post("/api/v1/vendor-kpi/submit", async ({ request }) => {
        writes.push(await request.json() as typeof writes[number]);
        return writes.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Try again" } }, { status: 503 }) : data({ averageScoreBps: 8620, submittedAt: "2026-09-28T00:00:00Z" });
      })
    );
    publicPage(); const user = userEvent.setup();
    await screen.findByText("Sample Supplier");
    for (const label of ["Rates offered", "Service communication", "Delivery coordination", "Defect liability addressal", "Commitment to timelines"]) await user.type(screen.getByRole("spinbutton", { name: label }), "86");
    await user.click(screen.getByRole("button", { name: "Save Vendor KPI" }));
    expect(await screen.findByText(/response could not be confirmed/)).toBeVisible();
    const rates = screen.getByRole("spinbutton", { name: "Rates offered" });
    await user.clear(rates); await user.type(rates, "87");
    await user.click(screen.getByRole("button", { name: "Save Vendor KPI" }));
    expect(await screen.findByRole("heading", { name: "Assessment saved" })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[0].scores.find(({ key }) => key === "rates_offered")?.score).toBe(86);
    expect(writes[1].scores.find(({ key }) => key === "rates_offered")?.score).toBe(87);
    expect(writes[1].idempotencyKey).not.toBe(writes[0].idempotencyKey);
  });
});
