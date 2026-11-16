import { useQuery, useQueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { executionApi, executionKeys, type ExecutionCommand, type ExecutionWork } from "../execution/executionApi";
import { executionFixture } from "../execution/executionTestFixtures";
import { ManagerWorkMonitor } from "./ManagerWorkMonitor";

let work: ExecutionWork;
let writes: ExecutionCommand[];
const saved = vi.fn();
const dirty = vi.fn();
const busy = vi.fn();

function Harness() {
  const client = useQueryClient();
  const detail = useQuery({ queryKey: executionKeys.detail(work.id), queryFn: () => executionApi.detail(work.id), initialData: work, staleTime: Infinity });
  return <><button onClick={() => void detail.refetch()}>Refresh test assignment</button><ManagerWorkMonitor work={detail.data} disabled={false}
    onSaved={async updated => { client.setQueryData(executionKeys.detail(updated.id), updated); saved(updated); }} onDirty={dirty} onBusy={busy}
    photos={<section aria-label="Work photos">Current work photos</section>} history={<details><summary>Activity history</summary>Saved history</details>} /></>;
}
function mount() {
  const user = userEvent.setup();
  renderWithQuery(<Harness />);
  return user;
}
function completion() {
  work = { ...work, status: "awaiting_verification", progress: 100, allowedActions: ["verify", "request_changes", "hold"],
    submission: { id: "submission-one", submittedAt: "2026-10-09T09:00:00Z", note: "Ready for final inspection", imageIds: ["photo-one"], version: 4 } };
}
beforeEach(() => {
  work = structuredClone(executionFixture);
  work.allowedActions = ["hold", "exempt_evidence"];
  writes = []; saved.mockClear(); dirty.mockClear(); busy.mockClear();
  server.use(http.get("/api/v1/execution/work/work-one", () => HttpResponse.json({ data: work })),
    http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand);
      work = { ...work, version: work.version + 1, allowedActions: [] };
      return HttpResponse.json({ data: work });
    }));
});

describe("Project Manager work monitor", () => {
  it("opens in read-only monitoring mode with photos, current updates and optional history", () => {
    mount();
    expect(screen.queryByRole("form", { name: "Review work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Latest vendor update" })).getByText("Frame installed")).toBeVisible();
    expect(screen.getByRole("region", { name: "Work photos" })).toBeVisible();
    expect(screen.queryByText("More actions")).not.toBeInTheDocument();
    expect(screen.queryByText("Work details & schedule")).not.toBeInTheDocument();
    expect(screen.getByText("Activity history").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("button", { name: "Place on hold" })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
    expect(dirty).toHaveBeenLastCalledWith(false);
  });

  it("ignores stale exemption actions and current exemption messages", () => {
    work = { ...work, allowedActions: ["exempt_evidence"], evidenceExemption: { reason: "Legacy inspection without photos", grantedById: "manager-one" } };
    mount();
    expect(screen.queryByText("More actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exemption/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Review work" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Photo exemption|Legacy inspection without photos/)).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("rejects verification of an exempted no-photo submission and retains the request-changes path", async () => {
    completion();
    work = { ...work, imageIds: ["later-unsubmitted-photo"], submission: { ...work.submission!, imageIds: [] }, evidenceExemption: { reason: "Old inspection exemption", grantedById: "manager-one" } };
    const user = mount();
    await user.click(screen.getByRole("button", { name: "Verify completion" }));
    expect(await screen.findByText("Completion requires at least one current-round photo. Request changes so the vendor can add one.")).toBeVisible();
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Add a current photo and submit the work again.");
    await user.click(screen.getByRole("button", { name: "Send change request" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ action: "request_changes", expectedVersion: 4, submissionId: "submission-one" });
  });

  it("hides prior-round vendor reports and staff notes after a new execution round", async () => {
    work.latestNote = "Internal staff note";
    const user = mount();
    expect(within(screen.getByRole("region", { name: "Latest vendor update" })).getByText("Frame installed")).toBeVisible();
    work = { ...work, version: 5, executionRound: 2, status: "changes_requested" };
    await user.click(screen.getByRole("button", { name: "Refresh test assignment" }));
    expect(await screen.findByText("No vendor update for the current round.")).toBeVisible();
    expect(screen.getByText("No update this round")).toBeVisible();
    expect(screen.queryByText("Frame installed")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal staff note")).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("verifies the exact submitted completion and version without approving for the Client", async () => {
    completion(); const user = mount();
    expect(screen.getByRole("form", { name: "Review work" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Completion submitted" })).toHaveTextContent("Ready for final inspection");
    expect(screen.getByText("Check the work and photos before verifying. Client acceptance is a separate step.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Approve|Send to Client|Accept completion/i })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: "Verification note" }), "  Checked finish and fittings  ");
    await user.click(screen.getByRole("button", { name: "Verify completion" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ action: "verify", expectedVersion: 4, submissionId: "submission-one", note: "Checked finish and fittings", idempotencyKey: expect.any(String) });
    expect(writes[0].idempotencyKey.length).toBeGreaterThan(7);
    expect(await screen.findByText("Update saved.")).toBeVisible();
    expect(saved).toHaveBeenCalledOnce();
  });

  it("requires a reason to request changes and sends it against the submitted completion", async () => {
    completion(); const user = mount();
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    expect(writes).toHaveLength(0);
    expect(screen.queryByRole("textbox", { name: "Verification note" })).not.toBeInTheDocument();
    const reason = screen.getByRole("textbox", { name: "Reason" });
    expect(reason).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Send change request" }));
    expect(writes).toHaveLength(0);
    await user.type(reason, "Repair the open joint and add a close-up photo.");
    await user.click(screen.getByRole("button", { name: "Send change request" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ action: "request_changes", expectedVersion: 4, submissionId: "submission-one", reason: "Repair the open joint and add a close-up photo.", idempotencyKey: expect.any(String) });
    expect(writes[0]).not.toHaveProperty("note");
  });

  it("preserves the verification note after a conflict and requires review of the latest submission before retry", async () => {
    completion();
    server.use(http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand);
      if (writes.length === 1) {
        work = { ...work, version: 5, submission: { ...work.submission!, id: "submission-two", note: "Replacement completion photos", imageIds: ["photo-two"], version: 5 } };
        return HttpResponse.json({ error: { code: "CONFLICT", message: "Completion changed." } }, { status: 409 });
      }
      work = { ...work, version: 6, status: "site_verified", allowedActions: [] }; return HttpResponse.json({ data: work });
    }));
    const user = mount();
    await user.type(screen.getByRole("textbox", { name: "Verification note" }), "Inspect the repaired joint");
    await user.click(screen.getByRole("button", { name: "Verify completion" }));
    expect(await screen.findByText("Completion changed.")).toBeVisible();
    expect(await screen.findByText("Replacement completion photos")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Verification note" })).toHaveValue("Inspect the repaired joint");
    expect(screen.getByRole("button", { name: "Verify completion" })).toBeDisabled();
    expect(writes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Use reviewed version 5" }));
    expect(screen.getByRole("button", { name: "Verify completion" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Verify completion" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes.map(input => [input.expectedVersion, input.submissionId])).toEqual([[4, "submission-one"], [5, "submission-two"]]);
    expect(writes[1].note).toBe("Inspect the repaired joint");
    expect(writes[1].idempotencyKey).not.toBe(writes[0].idempotencyKey);
  });

  it.each(["verify", "confirm_schedule"] as const)("requires explicit conflict review for %s even when its optional note is untouched", async action => {
    if (action === "verify") completion();
    else work = { ...work, status: "awaiting_schedule", schedule: null, proposedSchedule: { startDate: "2026-10-09", finishDate: "2026-10-13", reason: "Site ready" }, allowedActions: ["confirm_schedule"] };
    server.use(http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand);
      if (writes.length === 1) {
        work = action === "verify" ? { ...work, version: 5, submission: { ...work.submission!, id: "submission-two", version: 5 } }
          : { ...work, version: 5, proposedSchedule: { startDate: "2026-10-10", finishDate: "2026-10-15", reason: "Revised access dates" } };
        return HttpResponse.json({ error: { code: "CONFLICT", message: "Reviewed work changed." } }, { status: 409 });
      }
      work = { ...work, version: 6, allowedActions: [] }; return HttpResponse.json({ data: work });
    }));
    const user = mount();
    const label = action === "verify" ? "Verify completion" : "Confirm schedule";
    await user.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByRole("button", { name: "Use reviewed version 5" })).toBeVisible();
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    expect(writes).toHaveLength(1);
    if (action === "confirm_schedule") expect(screen.getByLabelText("Start date")).toHaveValue("2026-10-09");
    await user.click(screen.getByRole("button", { name: "Use reviewed version 5" }));
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject(action === "verify" ? { action, expectedVersion: 5, submissionId: "submission-two" }
      : { action, expectedVersion: 5, startDate: "2026-10-10", finishDate: "2026-10-15" });
    expect(writes[1]).not.toHaveProperty("note");
  });

  it("retains the draft but disables verification when the action is revoked", async () => {
    completion(); const user = mount();
    await user.type(screen.getByRole("textbox", { name: "Verification note" }), "Keep this inspection draft");
    work = { ...work, version: 5, allowedActions: [] };
    await user.click(screen.getByRole("button", { name: "Refresh test assignment" }));
    expect(await screen.findByText("This action is no longer available. Your unsaved inputs are retained.")).toBeVisible();
    const note = screen.getByRole("textbox", { name: "Verification note" });
    expect(note).toHaveValue("Keep this inspection draft"); expect(note).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verify completion" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use reviewed version 5" })).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  it("resumes an existing manager hold only after a reason is provided", async () => {
    work = { ...work, hold: { reason: "Site isolation required", startedAt: "2026-10-08T09:00:00Z", reviewDate: "2026-10-12" }, allowedActions: ["resume"] };
    server.use(http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand);
      work = { ...work, version: 5, hold: null, allowedActions: [] };
      return HttpResponse.json({ data: work });
    }));
    const user = mount();
    const reason = screen.getByRole("textbox", { name: "Reason" });
    expect(reason).toBeRequired();
    expect(screen.getByText(/On hold: Site isolation required/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Resume work" }));
    expect(writes).toHaveLength(0);
    await user.type(reason, "  Site isolation checked; work can continue.  ");
    await user.click(screen.getByRole("button", { name: "Resume work" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ action: "resume", expectedVersion: 4, reason: "Site isolation checked; work can continue.", idempotencyKey: expect.any(String) });
    expect(await screen.findByText("Update saved.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resume work" })).not.toBeInTheDocument();
    expect(screen.queryByText(/On hold: Site isolation required/)).not.toBeInTheDocument();
  });

  it.each(["vendor_hold", "not_allowed"] as const)("does not expose manager resume for %s", state => {
    work = state === "vendor_hold"
      ? { ...work, status: "blocked", hold: null, allowedActions: ["resume"] }
      : { ...work, hold: { reason: "Site isolation required", startedAt: "2026-10-08T09:00:00Z", reviewDate: "2026-10-12" }, allowedActions: [] };
    mount();
    expect(screen.queryByRole("button", { name: "Resume work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Review work" })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it("retains the resume reason but prevents saving after the permission is revoked", async () => {
    work = { ...work, hold: { reason: "Site isolation required", startedAt: "2026-10-08T09:00:00Z", reviewDate: "2026-10-12" }, allowedActions: ["resume"] };
    const user = mount();
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Keep this release explanation");
    work = { ...work, version: 5, allowedActions: [] };
    await user.click(screen.getByRole("button", { name: "Refresh test assignment" }));
    expect(await screen.findByText("This action is no longer available. Your unsaved inputs are retained.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveValue("Keep this release explanation");
    expect(screen.getByRole("textbox", { name: "Reason" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume work" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use reviewed version 5" })).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  it("offers required tracking setup directly and sends only the authorized setup command", async () => {
    work = { ...work, tracking: "setup_required", status: "assigned", allowedActions: ["setup"] };
    server.use(http.post("/api/v1/projects/project-one/execution/work-one", async ({ request }) => {
      writes.push(await request.json() as ExecutionCommand);
      work = { ...work, version: 5, tracking: "tracked", allowedActions: [] };
      return HttpResponse.json({ data: work });
    }));
    const user = mount();
    expect(screen.getByRole("button", { name: "Enable tracking" })).toBeVisible();
    expect(writes).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Enable tracking" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ action: "setup", expectedVersion: 4, idempotencyKey: expect.any(String) });
    expect(await screen.findByText("Update saved.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Enable tracking" })).not.toBeInTheDocument();
    expect(work.tracking).toBe("tracked");
  });

  it("does not grant tracking setup from the status alone", () => {
    work = { ...work, tracking: "setup_required", status: "assigned", allowedActions: [] };
    mount();
    expect(screen.queryByRole("button", { name: "Enable tracking" })).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
});
