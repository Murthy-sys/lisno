import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionFixture, executionPageFixture } from "../execution/executionTestFixtures";
import type { ExecutionCommand, ExecutionWork } from "../execution/executionApi";
import { VendorWorkPage } from "./VendorWorkPage";
import { MemoryRouter } from "react-router-dom";
const authState = vi.hoisted(() => ({ permissions: ["procurement.vendor_work.read","procurement.vendor_work.media.upload"] }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "vendor-user", role: "vendor" }, status: "authenticated", authorization: { role: "vendor", permissions: authState.permissions } }) }));
vi.mock("../execution/ExecutionLiveProvider", () => ({ useExecutionConnection: () => "live" }));
let work: ExecutionWork;
beforeEach(() => {
  work = structuredClone(executionFixture);
  authState.permissions = ["procurement.vendor_work.read","procurement.vendor_work.media.upload"];
  server.use(
    http.get("/api/v1/vendor/work/execution", () => HttpResponse.json({ data: executionPageFixture([work]) })),
    http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
    http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
    http.get("/api/v1/vendor/purchase-orders/order-one", () => HttpResponse.json({ data: { id: "order-one", orderNumber: "PO-100", projectId: "project-one", vendor: { id: "vendor-one", code: "VEN-1", name: "Oak Works" }, revision: 2, approvedAt: "2026-10-01T00:00:00Z", terms: "Install at project site", lines: [{ id: "line-one", itemName: "Oak wall panelling", description: "Issued panelling", quantityMilliUnits: 125000, uomCode: "sq-ft", scopeType: "execution", targetDate: "2026-10-20", deliveryLocation: "Project site", gstBasisPoints: 1800, totalPaise: 118000 }], totals: { netPaise: 100000, gstPaise: 18000, totalPaise: 118000 } } }))
  );
});
async function openWork() {
  const user = userEvent.setup(); renderWithQuery(<MemoryRouter><VendorWorkPage /></MemoryRouter>);
  await user.click(await screen.findByRole("button",{ name: /Open Oak wall panelling/ }));
  await screen.findByRole("form",{ name: work.allowedActions.includes("report") ? "Update work status" : "Update Main Line workflow" });
  return user;
}
describe("vendor execution workspace", () => {
  it("separates a 100% report from verified completion and retains the issued order", async () => {
    work = { ...work, progress: 100, allowedActions: ["report","submit"] };
    const user = await openWork();
    await user.click(screen.getByText("Work details & schedule"));
    expect(screen.queryByText(/(?:100|40)%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("Not verified")).toBeVisible();
    expect(screen.queryByRole("option",{ name: "Verify completion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{ name: "Send to Client" })).not.toBeInTheDocument();
    await user.click(screen.getByText("View approved purchase order PO-100"));
    expect(screen.getByText(/Issued panelling · 125 sq-ft/)).toBeVisible();
  });
  it("records a specific vendor hold reason without changing progress or exposing manager actions", async () => {
    const writes: ExecutionCommand[] = [];
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({request}) => { const input = await request.json() as ExecutionCommand; writes.push(input); work = { ...work, version: 5, status: "blocked", latestNote: input.note!, daily: { ...work.daily, state: "on_time" } }; return HttpResponse.json({ data: work }); }));
    const user = await openWork();
    await user.click(screen.getByRole("radio", { name: "On hold" }));
    const reason = screen.getByRole("textbox", { name: "Reason for hold" });
    expect(reason).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Save hold" }));
    expect(writes).toHaveLength(0);
    expect(screen.queryByRole("textbox", { name: "Next action to resolve blocker" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume work" })).not.toBeInTheDocument();
    await user.type(reason, "The client has not provided the entry key");
    await user.click(screen.getByRole("button", { name: "Save hold" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "report", updateType: "hold", expectedVersion: 4, status: "blocked", progress: 40, note: "The client has not provided the entry key", reason: "The client has not provided the entry key" });
    expect(writes[0]).not.toHaveProperty("nextAction");
    expect(writes[0].idempotencyKey.length).toBeGreaterThan(7);
    expect(await screen.findByText("Update saved.")).toBeVisible();
  });
  it("starts work at zero with one truthful update and no invented percentage", async () => {
    work = { ...work, status: "not_started", progress: 0, latestVendorReport: null, latestReportAt: null };
    const writes: ExecutionCommand[] = [];
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({ request }) => {
      const input = await request.json() as ExecutionCommand; writes.push(input);
      work = { ...work, status: "in_progress", version: 5, progress: 0 }; return HttpResponse.json({ data: work });
    }));
    const user = await openWork();
    expect(screen.getByRole("radio", { name: "Started working" })).toBeChecked();
    expect(screen.getAllByRole("radio").map(radio => radio.getAttribute("value"))).toEqual(["started", "progress", "hold", "completed"]);
    expect(screen.getByText("Work details & schedule").closest("details")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Started working" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "report", updateType: "started", expectedVersion: 4, status: "in_progress", progress: 0, note: "Started working." });
    expect(writes[0]).not.toHaveProperty("imageIds");
    expect(await screen.findByRole("button", { name: "Save update" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Started working" })).toBeDisabled();
  });

  it("keeps repeated photo updates in progress without asking for or changing a percentage", async () => {
    work = { ...work, progress: 0, latestVendorReport: { ...work.latestVendorReport!, progress: 0, updateType: "started" }, evidenceExemption: { reason: "Legacy physical inspection", grantedById: "manager-one" } };
    const writes: ExecutionCommand[] = [];
    let uploads = 0;
    server.use(http.get("/api/v1/vendor/work/work-one", () => HttpResponse.json({ data: { id: work.id, version: 9 + uploads, status: "in_progress" } })),
      http.post("/api/v1/vendor/work/work-one/images", async ({ request }) => {
        // Inspect the multipart body directly: Node's parser rejects Happy DOM File objects.
        const body = await request.text();
        expect(request.headers.get("content-type")).toContain("multipart/form-data; boundary=");
        expect(body).toContain(`name="expectedVersion"\r\n\r\n${9 + uploads}`);
        expect(body).toMatch(/name="idempotencyKey"\r\n\r\n[\w-]{8,}/);
        expect(body).toContain('name="image"; filename=');
        expect(body).toContain("Content-Type: image/jpeg");
        uploads++; work = { ...work, imageIds: [...work.imageIds, `uploaded-progress-photo-${uploads}`] };
        return HttpResponse.json({ data: { id: work.id, version: 9 + uploads } });
      }),
      http.post("/api/v1/vendor/work/work-one/execution", async ({ request }) => {
        const input = await request.json() as ExecutionCommand; writes.push(input);
        work = { ...work, version: work.version + 1, status: "in_progress", latestVendorReport: { ...work.latestVendorReport!, updateType: "progress", note: input.note!, progress: input.progress! } }; return HttpResponse.json({ data: work });
      }));
    const user = await openWork();
    await user.click(screen.getByRole("button", { name: "Save update" }));
    expect(await screen.findByText("Add at least one progress photo before saving.")).toBeVisible();
    expect(writes).toHaveLength(0);
    await user.upload(screen.getByLabelText("Add progress photo"), new File(["photo"], "progress.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Photo attached. Save your update when ready.")).toBeVisible();
    expect(uploads).toBe(1); expect(writes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Save update" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "report", updateType: "progress", expectedVersion: 4, status: "in_progress", progress: 0, note: "In progress.", imageIds: ["uploaded-progress-photo-1"] });
    expect(writes[0]).not.toHaveProperty("reason");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save update" })).toBeEnabled());
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "In progress" })).toBeVisible();
    await user.upload(screen.getByLabelText("Add progress photo"), new File(["next photo"], "day-two.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(uploads).toBe(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save update" })).toBeEnabled());
    await user.type(screen.getByRole("textbox", { name: "Progress note (optional)" }), "Today's site photos");
    await user.click(screen.getByRole("button", { name: "Save update" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({ updateType: "progress", expectedVersion: 5, status: "in_progress", progress: 0, imageIds: ["uploaded-progress-photo-1", "uploaded-progress-photo-2"] });
    expect(work.status).toBe("in_progress");
    expect(work.submission).toBeNull();
  });

  it("completes from partial progress in one photo-backed report while retaining Project Manager verification", async () => {
    work = { ...work, imageIds: ["current-completion-photo"] };
    const writes: ExecutionCommand[] = [];
    let oldSubmissions = 0;
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({ request }) => {
      const input = await request.json() as ExecutionCommand; writes.push(input);
      work = { ...work, version: 5, progress: 100, status: "awaiting_verification", allowedActions: [], nextOwner: "site_manager", latestVendorReport: { eventId: "completed-report", executionRound: 1, reportedAt: "2026-10-08T09:00:00Z", note: input.note!, reason: null, nextAction: null, progress: 100, status: "in_progress", updateType: "completed" }, submission: { id: "verification-review", submittedAt: "2026-10-08T09:00:00Z", note: input.note!, imageIds: ["current-completion-photo"], version: 5 } };
      return HttpResponse.json({ data: work });
    }), http.post("/api/v1/vendor/work/work-one/submit", () => { oldSubmissions++; return HttpResponse.json({ data: {} }); }));
    const user = await openWork();
    await user.click(screen.getByRole("radio", { name: "Completed" }));
    await user.click(screen.getByRole("button", { name: "Mark completed" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "report", updateType: "completed", expectedVersion: 4, status: "in_progress", progress: 100, note: "Work completed.", imageIds: ["current-completion-photo"] });
    expect(oldSubmissions).toBe(0);
    await waitFor(() => expect(screen.queryByRole("form", { name: "Update work status" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Send to Client" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify completion" })).not.toBeInTheDocument();
    expect(work.verification).toBeNull();
  });

  it("requires a completion photo even when a stale payload carries a Project Manager exemption", async () => {
    authState.permissions = ["procurement.vendor_work.read"];
    work = { ...work, evidenceExemption: { reason: "Legacy inspection without photos", grantedById: "manager-one" } };
    const writes: ExecutionCommand[] = [];
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand); return HttpResponse.json({ data: work });
    }));
    const user = await openWork();
    await user.click(screen.getByRole("radio", { name: "Completed" }));
    expect(screen.getByRole("heading", { name: "Completion photos (required)" })).toBeVisible();
    expect(screen.queryByLabelText("Add progress photo")).not.toBeInTheDocument();
    expect(screen.getByText("Photo upload is unavailable for your account. Contact the project team.")).toBeVisible();
    expect(screen.queryByText(/Legacy inspection without photos|approved completion without photos|optional: Project Manager exemption/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Grant.*exemption/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark completed" }));
    expect(await screen.findByText("Add at least one progress photo before saving.")).toBeVisible();
    expect(writes).toHaveLength(0);
    expect(work.submission).toBeNull();
  });

  it("does not offer photo upload without media permission or updates during a manager hold", async () => {
    authState.permissions = ["procurement.vendor_work.read"];
    const user = await openWork();
    expect(screen.queryByLabelText("Add progress photo")).not.toBeInTheDocument();
    expect(screen.getByText("Photo upload is unavailable for your account. Contact the project team.")).toBeVisible();
    work = { ...work, version: 5, allowedActions: [], hold: { reason: "Site safety review", startedAt: "2026-10-08T09:00:00Z", reviewDate: "2026-10-10" } };
    await user.click(screen.getByRole("button", { name: "Refresh assignment" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Update work status" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save update" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume work" })).not.toBeInTheDocument();
  });

  it("preserves unsaved inputs when reporting is revoked while the panel is open", async () => {
    let writes = 0;
    server.use(http.post("/api/v1/vendor/work/work-one/execution", () => { writes++; return HttpResponse.json({ data: work }); }));
    const user = await openWork();
    await user.type(screen.getByRole("textbox", { name: "Progress note (optional)" }), "Keep this unsaved progress note");
    work = { ...work, version: 5, allowedActions: [], hold: { reason: "Site safety review", startedAt: "2026-10-08T09:00:00Z", reviewDate: "2026-10-10" } };
    await user.click(screen.getByRole("button", { name: "Refresh assignment" }));
    expect(await screen.findByText("Work updates are no longer available. Your unsaved inputs are retained above for reference.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Progress note (optional)" })).toHaveValue("Keep this unsaved progress note");
    expect(screen.getByRole("button", { name: "Save update" })).toBeDisabled();
    expect(screen.getByLabelText("Add progress photo")).toBeDisabled();
    expect(writes).toBe(0);
  });

  it("retains a failed photo upload and retries the same receipt without submitting work", async () => {
    let uploads = 0;
    let detailReads = 0;
    let writes = 0;
    const uploadBodies: string[] = [];
    server.use(http.get("/api/v1/vendor/work/work-one", () => { detailReads++; return HttpResponse.json({ data: { id: work.id, version: 9 } }); }),
      http.post("/api/v1/vendor/work/work-one/images", async ({ request }) => {
        uploads++; uploadBodies.push(await request.text());
        if (uploads === 1) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Photo upload unavailable" } }, { status: 503 });
        work = { ...work, imageIds: ["retried-photo"] }; return HttpResponse.json({ data: { id: work.id, version: 10 } });
      }),
      http.post("/api/v1/vendor/work/work-one/execution", () => { writes++; return HttpResponse.json({ data: work }); }));
    const user = await openWork();
    await user.type(screen.getByRole("textbox", { name: "Progress note (optional)" }), "Frame is ready");
    await user.upload(screen.getByLabelText("Add progress photo"), new File(["photo"], "retry.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Photo upload unavailable")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Progress note (optional)" })).toHaveValue("Frame is ready");
    await user.click(screen.getByRole("button", { name: "Save update" }));
    expect(await screen.findByText("Finish uploading the selected photo before saving.")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "On hold" }));
    expect(screen.getByRole("button", { name: "Discard selected photo" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry photo upload" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry photo upload" })).not.toBeInTheDocument());
    expect(uploads).toBe(2); expect(detailReads).toBe(1); expect(writes).toBe(0);
    const receiptFrom = (body: string) => body.match(/name="idempotencyKey"\r\n\r\n([^\r]+)/)?.[1];
    expect(receiptFrom(uploadBodies[0])).toBeTruthy();
    expect(receiptFrom(uploadBodies[1])).toBe(receiptFrom(uploadBodies[0]));
    await user.click(screen.getByRole("radio", { name: "In progress" }));
    expect(screen.getByRole("textbox", { name: "Progress note (optional)" })).toHaveValue("Frame is ready");
    expect(screen.getByText("Photo attached. Save your update when ready.")).toBeVisible();
  });

  it("retains dirty values after conflict and requires explicit latest-version review", async () => {
    work = { ...work, imageIds: ["current-photo"] };
    const writes: ExecutionCommand[] = [];
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand);
      if (writes.length === 1) { work = { ...work, version: 5, latestNote: "A concurrent update" }; return HttpResponse.json({ error: { code: "CONFLICT", message: "Assignment changed." } }, { status: 409 }); }
      work = { ...work, version: 6, progress: 40 }; return HttpResponse.json({ data: work });
    }));
    const user = await openWork();
    await user.type(screen.getByRole("textbox",{name:"Progress note (optional)"}),"Keep my work note");
    await user.click(screen.getByRole("button",{name:"Save update"}));
    await screen.findByText("Assignment changed.");
    expect(screen.getByRole("textbox",{name:"Progress note (optional)"})).toHaveValue("Keep my work note");
    expect(await screen.findByRole("button",{name:"Use reviewed version 5"})).toBeVisible();
    expect(screen.getByRole("button",{name:"Save update"})).toBeDisabled();
    expect(writes).toHaveLength(1);
    await user.click(screen.getByRole("button",{name:"Use reviewed version 5"}));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Save update"})).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save update" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes.map(input => input.expectedVersion)).toEqual([4, 5]);
    expect(writes[1]).toMatchObject({ action: "report", updateType: "progress", progress: 40, note: "Keep my work note", imageIds: ["current-photo"] });
  });
  it("guards closing a dirty panel and preserves edits when keeping it open", async () => {
    const user = await openWork();
    await user.type(screen.getByRole("textbox",{name:"Progress note (optional)"}),"Unsaved note");
    const panel = screen.getByRole("dialog",{name:"Oak wall panelling"});
    await user.click(within(panel).getByRole("button",{name:"Close oak wall panelling"}));
    expect(await screen.findByRole("alertdialog",{name:"Discard unsaved changes?"})).toBeVisible();
    await user.click(screen.getByRole("button",{name:"Keep editing"}));
    expect(screen.getByRole("textbox",{name:"Progress note (optional)"})).toHaveValue("Unsaved note");
  });
  it("requires current-round photos for legacy completion despite a stale exemption", async () => {
    work = { ...work,progress:100,allowedActions:["submit"], evidenceExemption: { reason: "Legacy inspection without photos", grantedById: "manager-one" } };
    const writes: unknown[] = [];
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({ request }) => { writes.push(await request.json()); return HttpResponse.json({ data: work }); }));
    const user = await openWork();
    await user.type(screen.getByRole("textbox",{name:"Completion note"}),"Completed the issued scope");
    await user.click(screen.getByRole("button",{name:"Submit for site verification"}));
    expect(await screen.findByText("Add a photo for the current round before submitting completion.")).toBeVisible();
    expect(writes).toHaveLength(0);
    expect(screen.queryByText(/request a Project Manager photo exemption|Legacy inspection without photos/)).not.toBeInTheDocument();
  });
  it("sends site-verified work through the existing Client review only when authorized", async () => {
    work = { ...work, status:"site_verified",progress:100,allowedActions:[],canSubmitToClient:true,verification:{id:"verify-one",verifiedAt:"2026-10-08T10:00:00Z",verifiedById:"site-one",executionRound:1} };
    const writes: unknown[]=[];
    server.use(http.get("/api/v1/vendor/work/work-one",() => HttpResponse.json({data:{id:work.id,version:9,status:"in_progress"}})),http.post("/api/v1/vendor/work/work-one/submit",async ({request}) => {writes.push(await request.json());work={...work,canSubmitToClient:false,legacyStatus:"submitted_for_client"};return HttpResponse.json({data:{id:"client-review-one"}});}));
    const user=userEvent.setup();renderWithQuery(<MemoryRouter><VendorWorkPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button",{name:/Open Oak wall panelling/}));
    await user.type(await screen.findByRole("textbox",{name:"Note for Client"}),"Site checked; ready for Client review");
    await user.click(screen.getByRole("button",{name:"Send to Client"}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({expectedVersion:9,note:"Site checked; ready for Client review"});
    await waitFor(() => expect(screen.queryByRole("button",{name:"Send to Client"})).not.toBeInTheDocument());
  });
  it("does not fetch work when read permission is absent", () => {
    authState.permissions = [];
    renderWithQuery(<MemoryRouter><VendorWorkPage /></MemoryRouter>);
    expect(screen.getByText("You do not have permission to view vendor work.")).toBeVisible();
    expect(screen.queryByRole("button",{name:/Open Oak/})).not.toBeInTheDocument();
  });
  it("separates a current vendor report from newer workflow activity and hides opaque actor IDs", async () => {
    work = { ...work, latestNote: "Project Manager confirmed tomorrow's access.", latestVendorReport: { ...work.latestVendorReport!, note: "Installed the frame.", reason: "Waiting for area clearance.", nextAction: "Project Manager to arrange access." } };
    server.use(http.get("/api/v1/execution/work/work-one/history", () => HttpResponse.json({ data: { items: [{ id: "activity-one", assignmentId: work.id, action: "confirm_schedule", actorId: "internal-actor-id", occurredAt: "2026-10-09T09:00:00Z", executionRound: 1, localDate: "2026-10-09", note: "Access confirmed", reason: null, nextAction: null, startDate: null, finishDate: null, reviewDate: null, progress: null, status: null }], total: 1, limit: 20, offset: 0 } })));
    const user = await openWork();
    const report = screen.getByRole("region", { name: "Latest vendor report" });
    expect(within(report).getByText("Installed the frame.")).toBeVisible();
    expect(within(report).getByText("Reported reason: Waiting for area clearance.")).toBeVisible();
    expect(within(report).getByText("Reported next action: Project Manager to arrange access.")).toBeVisible();
    expect(within(report).queryByText(work.latestNote)).not.toBeInTheDocument();
    expect(screen.getByText("Latest workflow activity").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Activity history").closest("details")).not.toHaveAttribute("open");
    await user.click(screen.getByText("Latest workflow activity"));
    expect(within(screen.getByRole("region", { name: "Latest workflow activity" })).getByText(work.latestNote)).toBeVisible();
    await user.click(screen.getByText("Activity history"));
    await screen.findByText("Access confirmed");
    expect(screen.queryByText(/internal-actor-id/)).not.toBeInTheDocument();
  });
  it("does not reuse a prior-round report or verification during rework", async () => {
    work = { ...work, status: "changes_requested", executionRound: 2, progress: 100, verification: { id: "old-verification", verifiedAt: "2026-10-07T09:00:00Z", verifiedById: "manager-one", executionRound: 1 }, latestNote: "Recheck the finish." };
    const user = await openWork();
    await user.click(screen.getByText("Work details & schedule"));
    const panel = screen.getByRole("dialog", { name: "Oak wall panelling" });
    expect(within(panel).getByText("No vendor report is available for this execution round.")).toBeVisible();
    expect(within(panel).getByText("No report this round")).toBeVisible();
    expect(within(panel).queryByText(/(?:100|40)%/)).not.toBeInTheDocument();
    expect(within(panel).getByText("Not verified")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Latest vendor report" })).queryByText("Frame installed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to Client" })).not.toBeInTheDocument();
  });
  it("focuses the existing action without resetting an edited draft or submitting it", async () => {
    let writes = 0;
    server.use(http.post("/api/v1/vendor/work/work-one/execution", () => { writes++; return HttpResponse.json({ data: work }); }));
    const user = await openWork();
    await user.type(screen.getByRole("textbox", { name: "Progress note (optional)" }), "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Go to next action" }));
    expect(screen.getByRole("radio", { name: "In progress" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Progress note (optional)" })).toHaveValue("Keep this draft");
    expect(writes).toBe(0);
  });
  it("blocks the new shortcut and upload after an assignment refresh fails", async () => {
    const user = await openWork();
    await user.type(screen.getByRole("textbox", { name: "Progress note (optional)" }), "Still my draft");
    server.use(http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Refresh unavailable" } }, { status: 503 })));
    await user.click(screen.getByRole("button", { name: "Refresh assignment" }));
    expect(await screen.findByText("Refresh failed. This assignment may be out of date.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to next action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save update" })).toBeDisabled();
    expect(screen.getByLabelText("Add progress photo")).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Progress note (optional)" })).toHaveValue("Still my draft");
  });
  it("blocks Client submission while execution details are stale and preserves its note", async () => {
    work = { ...work, status: "site_verified", progress: 100, allowedActions: [], canSubmitToClient: true, verification: { id: "verify-one", verifiedAt: "2026-10-08T10:00:00Z", verifiedById: "site-one", executionRound: 1 } };
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter><VendorWorkPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /Open Oak wall panelling/ }));
    await user.type(await screen.findByRole("textbox", { name: "Note for Client" }), "Preserve this Client note");
    server.use(http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Refresh unavailable" } }, { status: 503 })));
    await user.click(screen.getByRole("button", { name: "Refresh assignment" }));
    await screen.findByText("Refresh failed. This assignment may be out of date.");
    expect(screen.getByRole("button", { name: "Send to Client" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Note for Client" })).toHaveValue("Preserve this Client note");
  });
});
