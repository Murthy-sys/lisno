import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { PMOperationsPanel } from "./PMOperationsPanel";
import type { PMItem, PMPanel } from "./projectManagerTypes";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated", user: { id: "pm-one", role: "site_manager" }, authorization: { role: "site_manager", permissions: ["pm.workspace.read", "pm.evidence.read", "pm.evidence.manage", "pm.snags.manage", "pm.quality.manage"] } }) }));
const item = (overrides: Partial<PMItem> = {}): PMItem => ({ id: "snag-one", kind: "snag", title: "Cabinet alignment", description: "Inspect the repaired door.", status: "resolved", severity: "warning", version: 4, sourceToken: null, facts: [], actions: [{ id: "verify", label: "Verify repair" }, { id: "reopen", label: "Reopen" }], ...overrides });
const panel = (tab: PMPanel["tab"], items: PMItem[], overrides: Partial<PMPanel> = {}): PMPanel => ({ tab, availability: "available", calculatedAt: "2026-10-27T09:00:00Z", items, total: items.length, issues: [], sources: [], people: [], actions: [], ...overrides });
const audit = (): PMItem => item({ id: "audit-one", kind: "quality_audit", title: "Carpentry", status: "draft", version: 2, sourceToken: "quality-v3", orderId: "order-one", basketId: "basket-one", week: "2026-10-26", actions: [{ id: "save_audit", label: "Save draft" }, { id: "sign_audit", label: "Sign audit" }], checks: [{ id: "q1", label: "Door alignment", answer: "pass", reason: null, evidenceIds: [], sampleCount: 1 }] });
beforeEach(() => { vi.restoreAllMocks(); });
function renderTab(tab: "vendors" | "client" | "snagging" | "quality") { return renderWithQuery(<MemoryRouter><PMOperationsPanel projectId="project-one" tab={tab} /></MemoryRouter>); }

describe("Project Manager operational tabs", () => {
  it("keeps repair verification separate and sends the exact version with a reason", async () => {
    let current = item(); const commands: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/snagging", () => HttpResponse.json({ data: panel("snagging", [current]) })), http.post("/api/v1/projects/project-one/pm/snags/snag-one/actions", async ({ request }) => { const command = await request.json() as Record<string, unknown>; commands.push(command); current = { ...current, status: "verified", version: 5, actions: [{ id: "reopen", label: "Reopen" }] }; return HttpResponse.json({ data: current }); }));
    const user = userEvent.setup(); renderTab("snagging");
    await user.click(await screen.findByRole("button", { name: "Verify repair" }));
    const dialog = screen.getByRole("dialog", { name: "Verify repair" });
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    expect(within(dialog).getByText(/does not replace execution verification or Client acceptance/)).toBeVisible();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Inspected the repaired alignment on site.");
    await user.click(within(dialog).getByRole("button", { name: "Verify repair" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ action: "verify", expectedVersion: 4, evidenceIds: [], reason: "Inspected the repaired alignment on site." });
    expect(commands[0]!.idempotencyKey).toEqual(expect.any(String));
    expect(await screen.findByText("Verified", { selector: ".pm-badge" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Verify repair" })).not.toBeInTheDocument();
  });

  it("submits unique evidence IDs when a previously uploaded photo is selected again", async () => {
    const uploads = ["photo-a", "photo-b", "photo-a"]; const commands: Record<string, unknown>[] = [];
    server.use(
      http.get("/api/v1/projects/project-one/pm/snagging", () => HttpResponse.json({ data: panel("snagging", [item()]) })),
      http.post("/api/v1/projects/project-one/pm/evidence/snag-one", () => HttpResponse.json({ data: [{ id: uploads.shift(), name: "inspection.jpg", mimeType: "image/jpeg", kind: "image" }] })),
      http.post("/api/v1/projects/project-one/pm/snags/snag-one/actions", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: item({ status: "verified", version: 5, actions: [] }) }); })
    );
    const user = userEvent.setup(); renderTab("snagging");
    await user.click(await screen.findByRole("button", { name: "Verify repair" }));
    const dialog = screen.getByRole("dialog", { name: "Verify repair" });
    const input = within(dialog).getByLabelText(/Evidence/);
    const first = new File(["photo-a"], "first.jpg", { type: "image/jpeg" });
    const second = new File(["photo-b"], "second.jpg", { type: "image/jpeg" });
    await user.upload(input, first); expect(await within(dialog).findByText("1 file(s) attached")).toBeVisible();
    await user.upload(input, second); expect(await within(dialog).findByText("2 file(s) attached")).toBeVisible();
    await user.upload(input, first); await waitFor(() => expect(uploads).toHaveLength(0));
    await waitFor(() => expect(input).toBeEnabled());
    expect(within(dialog).getByText("2 file(s) attached")).toBeVisible();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Inspection recorded with both photos.");
    await user.click(within(dialog).getByRole("button", { name: "Verify repair" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ evidenceIds: ["photo-a", "photo-b"], action: "verify", expectedVersion: 4 });
  });

  it("blocks cumulative evidence over 12 files before upload and retains the valid draft", async () => {
    let uploadCount = 0; const commands: Record<string, unknown>[] = [];
    const evidence = Array.from({ length: 7 }, (_, index) => ({ id: `photo-${index}`, name: `inspection-${index}.jpg`, mimeType: "image/jpeg", kind: "image" }));
    server.use(
      http.get("/api/v1/projects/project-one/pm/snagging", () => HttpResponse.json({ data: panel("snagging", [item()]) })),
      http.post("/api/v1/projects/project-one/pm/evidence/snag-one", () => { uploadCount++; return HttpResponse.json({ data: evidence }); }),
      http.post("/api/v1/projects/project-one/pm/snags/snag-one/actions", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: item({ status: "verified", version: 5, actions: [] }) }); })
    );
    const user = userEvent.setup(); renderTab("snagging");
    await user.click(await screen.findByRole("button", { name: "Verify repair" }));
    const dialog = screen.getByRole("dialog", { name: "Verify repair" }); const input = within(dialog).getByLabelText(/Evidence/);
    const files = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => new File([`${prefix}-${index}`], `${prefix}-${index}.jpg`, { type: "image/jpeg" }));
    await user.upload(input, files(7, "first")); expect(await within(dialog).findByText("7 file(s) attached")).toBeVisible();
    await user.upload(input, files(6, "next"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Attach up to 12 files. 7 already attached; select at most 5 more.");
    expect(uploadCount).toBe(1); expect(input).toBeEnabled();
    expect(within(dialog).getByText("7 file(s) attached")).toBeVisible();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Inspection recorded with the seven valid photos.");
    await user.click(within(dialog).getByRole("button", { name: "Verify repair" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.evidenceIds).toEqual(evidence.map(entry => entry.id));
  });

  it("retains form text and idempotency on an identical failed retry", async () => {
    const commands: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/snagging", () => HttpResponse.json({ data: panel("snagging", [item()]) })), http.post("/api/v1/projects/project-one/pm/snags/snag-one/actions", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ error: { code: "PM_CONFLICT", message: "A newer inspection exists." } }, { status: 409 }); }));
    const user = userEvent.setup(); renderTab("snagging");
    await user.click(await screen.findByRole("button", { name: "Verify repair" }));
    const dialog = screen.getByRole("dialog", { name: "Verify repair" }); const note = within(dialog).getByRole("textbox", { name: "Reason / note" });
    await user.type(note, "Inspection complete."); await user.click(within(dialog).getByRole("button", { name: "Verify repair" }));
    expect(await within(dialog).findByText("A newer inspection exists.")).toBeVisible(); expect(note).toHaveValue("Inspection complete.");
    await user.click(within(dialog).getByRole("button", { name: "Verify repair" }));
    await waitFor(() => expect(commands).toHaveLength(2)); expect(commands[0]!.idempotencyKey).toBe(commands[1]!.idempotencyKey);
  });

  it("counts saved evidence when a quality draft is reopened and preserves it after a rejected upload", async () => {
    const savedIds = Array.from({ length: 7 }, (_, index) => `saved-photo-${index}`);
    const current = audit(); current.checks![0]!.evidenceIds = savedIds;
    const commands: Record<string, unknown>[] = []; let uploadCount = 0;
    server.use(
      http.get("/api/v1/projects/project-one/pm/quality", () => HttpResponse.json({ data: panel("quality", [current]) })),
      http.post("/api/v1/projects/project-one/pm/evidence/audit-one", () => { uploadCount++; return HttpResponse.json({ data: [] }); }),
      http.put("/api/v1/projects/project-one/pm/quality-audits/audit-one", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: { ...current, version: 3 } }); })
    );
    const user = userEvent.setup(); renderTab("quality");
    await user.click(await screen.findByRole("button", { name: "Open checklist" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Open checklist" }));
    const dialog = screen.getByRole("dialog", { name: "Carpentry" }); const input = within(dialog).getByLabelText(/Evidence/);
    expect(within(dialog).getByText("7 file(s) attached")).toBeVisible();
    await user.upload(input, Array.from({ length: 6 }, (_, index) => new File([`new-${index}`], `new-${index}.jpg`, { type: "image/jpeg" })));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("7 already attached; select at most 5 more.");
    expect(uploadCount).toBe(0); expect(within(dialog).getByText("7 file(s) attached")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Save draft" }));
    expect(await within(dialog).findByText("Draft saved.")).toBeVisible();
    expect(commands).toHaveLength(1);
    expect(commands[0]!.answers).toEqual([expect.objectContaining({ id: "q1", evidenceIds: savedIds })]);
  });

  it("requires failed-check reasons, saves draft before signing, and preserves signed findings", async () => {
    let current = audit(); const saves: Record<string, unknown>[] = []; const signs: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/quality", () => HttpResponse.json({ data: panel("quality", [current]) })), http.put("/api/v1/projects/project-one/pm/quality-audits/audit-one", async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; saves.push(body); current = { ...current, version: 3, checks: body.answers as PMItem["checks"] }; return HttpResponse.json({ data: current });
    }), http.post("/api/v1/projects/project-one/pm/quality-audits/audit-one/sign", async ({ request }) => { signs.push(await request.json() as Record<string, unknown>); current = { ...current, version: 4, status: "signed_with_findings", actions: [{ id: "correct", label: "Create correction" }] }; return HttpResponse.json({ data: current }); }));
    const user = userEvent.setup(); renderTab("quality"); await user.click(await screen.findByRole("button", { name: "Open checklist" }));
    const dialog = screen.getByRole("dialog", { name: "Carpentry" });
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Result for Door alignment" }), "fail");
    expect(within(dialog).getByRole("textbox", { name: "Finding for Door alignment" })).toBeRequired();
    expect(within(dialog).getByRole("button", { name: "Sign audit" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Save draft" })); expect(saves).toHaveLength(0);
    await user.type(within(dialog).getByRole("textbox", { name: "Finding for Door alignment" }), "Door edge is misaligned.");
    await user.click(within(dialog).getByRole("button", { name: "Save draft" })); expect(await within(dialog).findByText("Draft saved.")).toBeVisible();
    expect(saves[0]).toMatchObject({ action: "save", expectedVersion: 2, orderId: "order-one", basketId: "basket-one", sourceToken: "quality-v3", week: "2026-10-26", answers: [{ id: "q1", answer: "fail", reason: "Door edge is misaligned.", evidenceIds: [], sampleCount: 1 }] });
    await user.type(within(dialog).getByRole("textbox", { name: "Signature note" }), "Weekly inspection recorded with repair required.");
    await user.click(within(dialog).getByRole("button", { name: "Sign audit" }));
    expect(await within(dialog).findByText("Audit signed with findings. Failed checks remain recorded.")).toBeVisible();
    expect(signs[0]).toMatchObject({ expectedVersion: 3, sourceToken: "quality-v3", reason: "Weekly inspection recorded with repair required." });
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument(); expect(within(dialog).getByRole("button", { name: "Create correction" })).toBeVisible();
  });

  it("only renders source-authorized certification actions and message composition links", async () => {
    const milestone = item({ id: "order:final", kind: "payment_milestone", title: "Final milestone", status: "not_requested", amountPaise: 250000, actions: [] });
    const vendor = item({ id: "vendor-one", kind: "vendor", title: "Joinery partner", status: "assigned", actions: [], children: [milestone] });
    server.use(http.get("/api/v1/projects/project-one/pm/vendors", () => HttpResponse.json({ data: panel("vendors", [vendor]) })));
    renderTab("vendors"); expect(await screen.findByText("Final milestone")).toBeVisible(); expect(screen.queryByRole("button", { name: /Certify|Approve|Request certification/ })).not.toBeInTheDocument();
  });

  it("holds only explicitly selected eligible assignments with their observed versions", async () => {
    const vendor = item({ id: "vendor-one", vendorId: "vendor-one", kind: "vendor", title: "Joinery partner", status: "assigned", sourceToken: "issued-v2", version: 0, actions: [{ id: "issue_notice", label: "Issue notice" }], children: [] });
    const commands: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/vendors", () => HttpResponse.json({ data: panel("vendors", [vendor]) })), http.get("/api/v1/projects/project-one/execution", () => HttpResponse.json({ data: { items: [{ id: "work-one", itemName: "Wardrobe", roomName: "Main bedroom", progress: 30, version: 7, allowedActions: ["hold"] }, { id: "work-two", itemName: "Completed cabinet", roomName: "Kitchen", progress: 100, version: 9, allowedActions: [] }], total: 2 } })), http.post("/api/v1/projects/project-one/pm/vendor-notices", async ({ request }) => { commands.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: item({ kind: "vendor_notice" }) }); }));
    const user = userEvent.setup(); renderTab("vendors"); await user.click(await screen.findByRole("button", { name: "Issue notice" }));
    const dialog = screen.getByRole("dialog", { name: "Issue notice" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Notice type" }), "stop_work");
    await user.click(await within(dialog).findByRole("checkbox", { name: /Wardrobe/ }));
    expect(within(dialog).queryByRole("checkbox", { name: /Completed cabinet/ })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Review date"), "2026-11-03");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason / note" }), "Review unsafe joinery before continuing.");
    await user.click(within(dialog).getByRole("button", { name: "Issue notice" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ vendorId: "vendor-one", sourceToken: "issued-v2", kind: "stop_work", reviewDate: "2026-11-03", assignments: [{ assignmentId: "work-one", expectedVersion: 7 }] });
  });

  it("opens a deep-linked audit page and continues a correction without editing its signature", async () => {
    const signed = { ...audit(), version: 5, status: "signed", actions: [{ id: "correct", label: "Create correction" }] };
    const reads: URL[] = []; const corrections: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/projects/project-one/pm/quality", ({ request }) => { reads.push(new URL(request.url)); return HttpResponse.json({ data: panel("quality", [signed], { total: 26 }) }); }), http.put("/api/v1/projects/project-one/pm/quality-audits/audit-one", async ({ request }) => {
      corrections.push(await request.json() as Record<string, unknown>); return HttpResponse.json({ data: { ...audit(), id: "correction-one", version: 1, checks: [{ id: "q1", label: "Door alignment", answer: null, reason: null, evidenceIds: [] }] } });
    }));
    const user = userEvent.setup(); renderWithQuery(<MemoryRouter initialEntries={["/projects/project-one/execution?tab=quality&tabOffset=25&entity=audit-one"]}><PMOperationsPanel projectId="project-one" tab="quality" /></MemoryRouter>);
    const dialog = await screen.findByRole("dialog", { name: "Carpentry" }); expect(reads[0]!.searchParams.get("offset")).toBe("25");
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Create correction" }));
    const correction = screen.getByRole("dialog", { name: "Create correction" });
    await user.type(within(correction).getByRole("textbox", { name: "Reason / note" }), "Record the follow-up inspection.");
    await user.click(within(correction).getByRole("button", { name: "Create draft" }));
    expect(await screen.findByText("Correction draft created. The previous signature is preserved.")).toBeVisible();
    expect(corrections[0]).toMatchObject({ action: "correct", expectedVersion: 5, reason: "Record the follow-up inspection." });
    expect(within(screen.getByRole("dialog", { name: "Carpentry" })).getByRole("combobox", { name: "Result for Door alignment" })).toHaveValue("");
  });
});
