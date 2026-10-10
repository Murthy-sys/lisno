import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionFixture, executionPageFixture } from "../execution/executionTestFixtures";
import type { ExecutionCommand, ExecutionWork } from "../execution/executionApi";
import { VendorWorkPage } from "./VendorWorkPage";
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
  const user = userEvent.setup(); renderWithQuery(<VendorWorkPage />);
  await user.click(await screen.findByRole("button",{ name: /Open Oak wall panelling/ }));
  await screen.findByRole("form",{ name: "Update Main Line workflow" });
  return user;
}
describe("vendor execution workspace", () => {
  it("separates a 100% report from verified completion and retains the issued order", async () => {
    work = { ...work, progress: 100, allowedActions: ["report","submit"] };
    const user = await openWork();
    expect(screen.getByText("100% vendor reported")).toBeVisible();
    expect(screen.getByText("Not verified")).toBeVisible();
    expect(screen.queryByRole("option",{ name: "Verify completion" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{ name: "Send to Client" })).not.toBeInTheDocument();
    await user.click(screen.getByText("View approved purchase order PO-100"));
    expect(screen.getByText(/Issued panelling · 125 sq-ft/)).toBeVisible();
  });
  it("records a blocked daily report with reason, next action and the expected version", async () => {
    const writes: ExecutionCommand[] = [];
    server.use(http.post("/api/v1/vendor/work/work-one/execution", async ({request}) => { const input = await request.json() as ExecutionCommand; writes.push(input); work = { ...work, version: 5, status: "blocked", latestNote: input.note!, daily: { ...work.daily, state: "on_time" } }; return HttpResponse.json({ data: work }); }));
    const user = await openWork();
    await user.selectOptions(screen.getByRole("combobox",{name:"Work status"}),"blocked");
    await user.type(screen.getByRole("textbox",{name:"Work note"}),"Awaiting site clearance");
    await user.type(screen.getByRole("textbox",{name:"Next action to resolve blocker"}),"Site Manager to clear the work area");
    await user.click(screen.getByRole("button",{name:"Daily update"}));
    expect(await screen.findByText("Give a reason for no progress, rework or a blocker.")).toBeVisible();
    await user.type(screen.getByRole("textbox",{name:"Reason"}),"Access is blocked");
    await user.click(screen.getByRole("button",{name:"Daily update"}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action:"report", expectedVersion:4, status:"blocked", progress:40, note:"Awaiting site clearance", reason:"Access is blocked", nextAction:"Site Manager to clear the work area",imageIds:[] });
    expect(writes[0].idempotencyKey.length).toBeGreaterThan(7);
    expect(await screen.findByText("Update saved.")).toBeVisible();
  });
  it("retains dirty values after conflict and requires explicit latest-version review", async () => {
    let writes = 0;
    server.use(http.post("/api/v1/vendor/work/work-one/execution", () => { writes++; work = { ...work,version:5, latestNote:"A concurrent update" }; return HttpResponse.json({error:{code:"CONFLICT",message:"Assignment changed."}},{status:409}); }));
    const user = await openWork();
    await user.clear(screen.getByRole("spinbutton",{name:"Vendor reported progress (%)"}));
    await user.type(screen.getByRole("spinbutton",{name:"Vendor reported progress (%)"}),"55");
    await user.type(screen.getByRole("textbox",{name:"Work note"}),"Keep my work note");
    await user.click(screen.getByRole("button",{name:"Daily update"}));
    await screen.findByText("Assignment changed.");
    expect(screen.getByRole("textbox",{name:"Work note"})).toHaveValue("Keep my work note");
    expect(await screen.findByRole("button",{name:"Use reviewed version 5"})).toBeVisible();
    expect(screen.getByRole("button",{name:"Daily update"})).toBeDisabled();
    expect(writes).toBe(1);
    await user.click(screen.getByRole("button",{name:"Use reviewed version 5"}));
    expect(screen.getByRole("button",{name:"Daily update"})).toBeEnabled();
  });
  it("guards closing a dirty panel and preserves edits when keeping it open", async () => {
    const user = await openWork();
    await user.type(screen.getByRole("textbox",{name:"Work note"}),"Unsaved note");
    const panel = screen.getByRole("dialog",{name:"Oak wall panelling"});
    await user.click(within(panel).getByRole("button",{name:"Close oak wall panelling"}));
    expect(await screen.findByRole("alertdialog",{name:"Discard unsaved changes?"})).toBeVisible();
    await user.click(screen.getByRole("button",{name:"Keep editing"}));
    expect(screen.getByRole("textbox",{name:"Work note"})).toHaveValue("Unsaved note");
  });
  it("requires current-round photos or an exemption before completion submission", async () => {
    work = { ...work,progress:100,allowedActions:["submit"] };
    const user = await openWork();
    await user.type(screen.getByRole("textbox",{name:"Completion note"}),"Completed the issued scope");
    await user.click(screen.getByRole("button",{name:"Submit for site verification"}));
    expect(await screen.findByText("Add a photo for the current round or request a Site Manager photo exemption.")).toBeVisible();
  });
  it("sends site-verified work through the existing Client review only when authorized", async () => {
    work = { ...work, status:"site_verified",progress:100,allowedActions:[],canSubmitToClient:true,verification:{id:"verify-one",verifiedAt:"2026-10-08T10:00:00Z",verifiedById:"site-one",executionRound:1} };
    const writes: unknown[]=[];
    server.use(http.get("/api/v1/vendor/work/work-one",() => HttpResponse.json({data:{id:work.id,version:9,status:"in_progress"}})),http.post("/api/v1/vendor/work/work-one/submit",async ({request}) => {writes.push(await request.json());work={...work,canSubmitToClient:false,legacyStatus:"submitted_for_client"};return HttpResponse.json({data:{id:"client-review-one"}});}));
    const user=userEvent.setup();renderWithQuery(<VendorWorkPage />);
    await user.click(await screen.findByRole("button",{name:/Open Oak wall panelling/}));
    await user.type(await screen.findByRole("textbox",{name:"Note for Client"}),"Site checked; ready for Client review");
    await user.click(screen.getByRole("button",{name:"Send to Client"}));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({expectedVersion:9,note:"Site checked; ready for Client review"});
    await waitFor(() => expect(screen.queryByRole("button",{name:"Send to Client"})).not.toBeInTheDocument());
  });
  it("does not fetch work when read permission is absent", () => {
    authState.permissions = [];
    renderWithQuery(<VendorWorkPage />);
    expect(screen.getByText("You do not have permission to view vendor work.")).toBeVisible();
    expect(screen.queryByRole("button",{name:/Open Oak/})).not.toBeInTheDocument();
  });
});
