import { vendorLoginAccessFixture } from "./vendorLoginAccessFixtures";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role, PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { VendorInductionPublicInspection, VendorInductionQuestion, VendorInductionStaffDetail } from "../../../../shared/knowledge/vendorInduction";
import { createVendorInductionWorkbookTools, VENDOR_INDUCTION_WORKBOOK_MIME } from "../../../../shared/knowledge/vendorInductionWorkbook";
import type { VendorKpiStaffDetail } from "../../../../shared/knowledge/vendorKpi";
import { VendorKpiStaffPage } from "./VendorKpiStaffPage";
import { VendorInductionPublicPage } from "./VendorInductionPublicPage";
import { captureVendorInductionTokenBeforeRouterMount } from "./vendorInductionTokenVault";
import { projectProcurementKeys } from "./projectProcurementApi";

const token = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const data = (value: unknown) => HttpResponse.json({ data: value });
let role: Role = "procurement";
let permissions: readonly PermissionCode[] | undefined;
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: role === "super_admin" ? "super-admin-one" : "procurement-one", name: "Staff", role }, authorization: authorizationFor(role, permissions ?? [...authorizationFor(role).permissions, "procurement.vendor_induction.read", "procurement.vendor_induction.manage", "procurement.vendor_induction.request", "procurement.vendor_induction.review"]) }) }));

const baseKpi: VendorKpiStaffDetail = {
  vendor: { id: "vendor-one", code: "VH-1", name: "Timber House", status: "active", vendorType: "execution", workProfile: "Cabinetry", mainBasketNames: ["Carpentry"], subBasketNames: ["Cabinets"], emailAvailable: true },
  rubricVersion: 1, selfAssessment: null, procurementAssessment: null, officialScoreBps: null, request: null, requestEligibility: "ready"
};
const first: VendorInductionQuestion = { id: "crew", key: "crew", section: "Site capacity", prompt: "How many trained workers can you mobilize?", helpText: "Typical site crew", type: "number", required: true, enabled: true, options: [], unit: "workers", min: 1, max: 100, showIf: null };
const parent: VendorInductionQuestion = { id: "subcontract", key: "subcontract", section: "Delivery controls", prompt: "Will you subcontract work?", helpText: null, type: "yes_no", required: true, enabled: true, options: [], unit: null, min: null, max: null, showIf: null };
const child: VendorInductionQuestion = { id: "subcontract-detail", key: "subcontract_detail", section: "Delivery controls", prompt: "Which work will be subcontracted?", helpText: null, type: "short_text", required: true, enabled: true, options: [], unit: null, min: null, max: null, showIf: { questionId: "subcontract", optionIds: ["yes"] } };
const questionnaire = { id: "questionnaire-one", version: 1, vendorType: "execution" as const, questions: [first, parent, child], publishedAt: "2026-09-28T10:00:00Z" };
const activation = { lifecycleStatus: "active" as const, effectiveStatus: "under_review" as const, gates: { inductionApproved: false, vendorSelfKpiComplete: false, procurementKpiComplete: false, profileComplete: true, physicalAddressVerified: true } };
const baseInduction: VendorInductionStaffDetail = {
  vendor: { id: "vendor-one", name: "Timber House", vendorType: "execution", emailAvailable: true }, activation,
  draft: null, published: null, request: null, requestEligibility: "no_published_questionnaire",
  submission: null, review: null, history: { submissions: [], reviews: [] }
};

function staffPage() {
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return <VendorKpiStaffPage />; }
  const path = role === "super_admin" ? "/admin/procurement/vendors/vendor-one" : "/procurement/vendors/vendor-one";
  const view = renderWithQuery(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/procurement/vendors/:vendorId" element={<Capture />} /><Route path="/procurement/vendors/:vendorId" element={<Capture />} /></Routes></MemoryRouter>);
  return { ...view, get client() { return client; } };
}
function publicPage() {
  window.history.replaceState(null, "", `/vendor-induction#token=${token}`);
  captureVendorInductionTokenBeforeRouterMount();
  return renderWithQuery(<VendorInductionPublicPage />);
}

beforeEach(() => {
  server.use(http.get("/api/v1/procurement/vendors/vendor-one/login-access", () => HttpResponse.json({ data: vendorLoginAccessFixture })));
  role = "procurement"; permissions = undefined;
  window.history.replaceState(null, "", "/"); captureVendorInductionTokenBeforeRouterMount();
  server.use(http.get("/api/v1/procurement/vendor-kpis/vendor-one", () => data(baseKpi)));
});

describe("staff vendor induction", () => {
  it.each(["procurement", "super_admin"] as const)("shows the three backend gates and shared induction controls for %s", async (actor) => {
    role = actor;
    server.use(http.get("/api/v1/procurement/vendor-inductions/vendor-one", () => data(baseInduction)));
    staffPage(); const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Timber House" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to vendors" })).toHaveAttribute("href", actor === "super_admin" ? "/admin/procurement/vendors" : "/procurement/vendors");
    const checklist = await screen.findByRole("region", { name: "Vendor activation" });
    expect(within(checklist).getByText("Under Review")).toBeVisible();
    expect(within(checklist).getByText(/Vendor self KPI missing/)).toBeVisible();
    expect(within(checklist).getByText(/Vendor answers need Procurement approval/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Induction" }));
    expect(screen.getByRole("button", { name: "Induction" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(await screen.findByRole("region", { name: "Questionnaire draft" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download Excel template" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request induction from vendor" })).not.toBeInTheDocument();
  });

  it("saves a manual draft, publishes its version, then requests a one-time vendor response", async () => {
    let current = baseInduction;
    const saves: unknown[] = []; const publishes: unknown[] = []; const requests: unknown[] = [];
    server.use(
      http.get("/api/v1/procurement/vendor-inductions/vendor-one", () => data(current)),
      http.put("/api/v1/procurement/vendor-inductions/vendor-one/draft", async ({ request }) => {
        const body = await request.json() as { questions: VendorInductionQuestion[] }; saves.push(body);
        current = { ...current, draft: { version: 1, vendorType: "execution", questions: body.questions, updatedAt: "2026-09-28T10:00:00Z" } };
        return data(current);
      }),
      http.post("/api/v1/procurement/vendor-inductions/vendor-one/publish", async ({ request }) => {
        publishes.push(await request.json());
        current = { ...current, published: { ...questionnaire, questions: current.draft!.questions }, requestEligibility: "ready" };
        return data(current);
      }),
      http.post("/api/v1/procurement/vendor-inductions/vendor-one/requests", async ({ request }) => {
        requests.push(await request.json());
        current = { ...current, request: { status: "sent", version: 1, requestedAt: "2026-09-28T10:00:00Z", expiresAt: "2026-09-29T10:00:00Z", sentAt: "2026-09-28T10:00:00Z", canResendAt: null }, requestEligibility: "pending" };
        return data(current);
      })
    );
    const view = staffPage(); const user = userEvent.setup();
    view.client.setQueryData(projectProcurementKeys.vendorSearch(""), { pages: [], pageParams: [] });
    await user.click(await screen.findByRole("button", { name: "Induction" }));
    await user.click(screen.getByRole("button", { name: "Add question" }));
    await user.type(screen.getByRole("textbox", { name: "Question" }), "Can you provide a named site supervisor?");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Draft saved.")).toBeVisible();
    expect(view.client.getQueryState(projectProcurementKeys.vendorSearch(""))?.isInvalidated).toBe(true);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ expectedVersion: null, vendorType: "execution", questions: [{ prompt: "Can you provide a named site supervisor?", enabled: true }] });
    await user.click(screen.getByRole("button", { name: "Publish version" }));
    expect(await screen.findByText("Questionnaire version published.")).toBeVisible();
    expect(publishes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Request induction from vendor" }));
    expect(await screen.findByText("Induction request sent to the vendor profile email.")).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  it("shows immutable submitted answers and requires a reason for requested changes", async () => {
    const submitted = { id: "submission-one", requestId: "request-one", questionnaireVersion: 1, questionnaire, answers: [{ questionId: "crew", value: 12 }, { questionId: "subcontract", value: false }], submittedAt: "2026-09-28T11:00:00Z" };
    let current: VendorInductionStaffDetail = { ...baseInduction, published: questionnaire, submission: submitted, requestEligibility: "awaiting_review", history: { submissions: [submitted], reviews: [] } };
    const writes: unknown[] = [];
    server.use(
      http.get("/api/v1/procurement/vendor-inductions/vendor-one", () => data(current)),
      http.post("/api/v1/procurement/vendor-inductions/vendor-one/reviews", async ({ request }) => {
        const body = await request.json() as { decision: "approved" | "changes_requested"; reason: string | null }; writes.push(body);
        current = { ...current, review: { id: "review-one", submissionId: submitted.id, decision: body.decision, reason: body.reason, actorId: "procurement-one", reviewedAt: "2026-09-28T12:00:00Z", version: 1 }, requestEligibility: body.decision === "approved" ? "approved" : "ready" };
        return data(current);
      })
    );
    staffPage(); const user = userEvent.setup(); await user.click(await screen.findByRole("button", { name: "Induction" }));
    const response = (await screen.findAllByRole("region", { name: "Vendor response" }))[0];
    expect(within(response).getByText("12 workers")).toBeVisible();
    expect(within(response).getByText("No")).toBeVisible();
    expect(within(response).queryByText("Which work will be subcontracted?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Reason for requested changes" }), "Please clarify site supervision.");
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    expect(await screen.findByText("Changes requested. Send a new link when ready.")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ submissionId: "submission-one", decision: "changes_requested", reason: "Please clarify site supervision.", expectedReviewVersion: null });
  });

  it("previews imported workbook questions and requires explicit selection before saving", async () => {
    const writes: unknown[] = [];
    server.use(
      http.get("/api/v1/procurement/vendor-inductions/vendor-one", () => data(baseInduction)),
      http.put("/api/v1/procurement/vendor-inductions/vendor-one/draft", async ({ request }) => { writes.push(await request.json()); return data({ ...baseInduction, draft: { version: 1, vendorType: "execution", questions: [first], updatedAt: "2026-09-28T10:00:00Z" } }); })
    );
    staffPage(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Induction" }));
    const tools = createVendorInductionWorkbookTools(() => import("exceljs"));
    const buffer = await tools.createExportBuffer([first]);
    const file = new File([buffer], "vendor-induction.xlsx", { type: VENDOR_INDUCTION_WORKBOOK_MIME });
    Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(buffer) });
    await user.upload(screen.getByLabelText("Import Excel questions"), file);
    const preview = await screen.findByRole("region", { name: "Import preview" });
    expect(within(preview).getByText("How many trained workers can you mobilize?")).toBeVisible();
    expect(within(preview).getByRole("button", { name: "Add selected to draft" })).toBeDisabled();
    expect(writes).toHaveLength(0);
    await user.click(within(preview).getByRole("checkbox"));
    await user.click(within(preview).getByRole("button", { name: "Add selected to draft" }));
    expect(await screen.findByText(/1 questions added to the unsaved draft/)).toBeVisible();
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(writes).toHaveLength(1));
  });
});

describe("one-time vendor induction", () => {
  const inspection: VendorInductionPublicInspection = { vendor: { name: "Timber House", vendorType: "execution", workProfile: "Cabinetry", representativeName: "Asha", representativePosition: "Owner" }, questionnaire, changeNote: null, expiresAt: "2099-01-01T00:00:00Z" };
  it("scrubs the token, validates conditional questions, and omits hidden answers", async () => {
    const submits: unknown[] = [];
    server.use(http.post("/api/v1/vendor-induction/inspect", () => data(inspection)), http.post("/api/v1/vendor-induction/submit", async ({ request }) => { submits.push(await request.json()); return data({ submittedAt: "2026-09-28T12:00:00Z" }); }));
    publicPage(); const user = userEvent.setup();
    expect(window.location.href).not.toContain(token);
    expect(await screen.findByText("Timber House")).toBeVisible();
    const identity = screen.getByRole("region", { name: "Vendor details" });
    expect(within(identity).getByText("Asha")).toBeVisible();
    expect(within(identity).queryByText(/basket|VH-1/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Which work will be subcontracted?" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review answers" }));
    expect(await screen.findByText("Please complete the highlighted questions before reviewing your answers.")).toBeVisible();
    await user.type(screen.getByRole("spinbutton", { name: "How many trained workers can you mobilize?" }), "12");
    await user.click(screen.getByRole("radio", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Review answers" }));
    expect(await screen.findByRole("region", { name: "Review answers" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(await screen.findByRole("heading", { name: "Answers submitted" })).toBeVisible();
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({ token, answers: [{ questionId: "crew", value: 12 }, { questionId: "subcontract", value: false }] });
    expect(JSON.stringify(submits[0])).not.toContain("subcontract-detail");
  });

  it("shows a non-disclosing unavailable state", async () => {
    server.use(http.post("/api/v1/vendor-induction/inspect", () => HttpResponse.json({ error: { code: "INVALID_TOKEN", message: "Invalid" } }, { status: 410 })));
    publicPage();
    expect(await screen.findByText(/induction link is unavailable/)).toBeVisible();
    expect(screen.queryByText("Timber House")).not.toBeInTheDocument();
  });
});
