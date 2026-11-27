import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../../test/render";
import { server } from "../../../test/server";
import { lifecycleKeys, type ProcurementProgressCheck } from "./lifecycleApi";
import { lifecycleFixtures } from "./lifecycleFixtures.test-support";
import { LifecycleWorkspace } from "./LifecycleWorkspace";
import { ProgressPanel } from "./ProgressPanel";
import { HandoverPanel } from "./HandoverPanel";
import { SignoffPanel } from "./SignoffPanel";
import { InspectionsPanel } from "./InspectionsPanel";

vi.mock("./PaymentsPanel", () => ({ PaymentsPanel: () => <h2>Vendor payment workspace</h2> }));
const path = "/api/v1/procurement/projects/project-a/lifecycle";
const props = { projectId: "project-a", actorId: "buyer-a" };
function install() {
  const data = lifecycleFixtures(); let denied = false;
  server.use(http.get(path, () => denied ? HttpResponse.json({ error: { code: "FORBIDDEN", message: "Access changed." } }, { status: 403 }) : HttpResponse.json({ data: data.summary })),
    http.get(`${path}/reviews`, () => HttpResponse.json({ data: data.reviews })), http.get(`${path}/inspections`, () => HttpResponse.json({ data: data.inspections })), http.get(`${path}/handover`, () => HttpResponse.json({ data: data.handover })), http.get(`${path}/readiness`, () => HttpResponse.json({ data: data.readiness })));
  return { data, revoke: () => { denied = true; } };
}
function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation(); const navigate = useNavigate(); const client = useQueryClient();
  return <><button onClick={() => navigate(-1)}>Back one page</button><button onClick={() => void client.invalidateQueries({ queryKey: lifecycleKeys.all })}>Refresh lifecycle</button><output aria-label="Current query">{location.search}</output>{children}</>;
}
function Vendors() { const [value, setValue] = useState(""); return <label>Vendor appointment draft<input value={value} onChange={event => setValue(event.target.value)} /></label>; }
function workspace() { return renderWithQuery(<MemoryRouter initialEntries={["/procurement/projects/project-a?basket=basket-a"]}><Shell><LifecycleWorkspace {...props}><Vendors /></LifecycleWorkspace></Shell></MemoryRouter>); }

describe("Procurement project lifecycle", () => {
  it("reveals a linked active tab on narrow layouts and resize without vertical scrolling", async () => {
    install(); const user = userEvent.setup(); let width = 320; let resize!: ResizeObserverCallback;
    const originalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const strip = this.closest(".lc-tab-scroll") as HTMLElement | null;
      const index = this.getAttribute("role") === "tab" ? Array.from(this.parentElement!.children).indexOf(this) : -1;
      const left = index >= 0 ? index * 220 - (strip?.scrollLeft ?? 0) : 0;
      const elementWidth = index >= 0 ? 220 : width;
      return { x: left, y: 0, top: 0, left, right: left + elementWidth, bottom: 64, width: elementWidth, height: 64, toJSON: () => ({}) };
    });
    const pageScroll = vi.spyOn(window, "scrollTo");
    try {
      renderWithQuery(<MemoryRouter initialEntries={["/?tab=signoff&basket=basket-a"]}><LifecycleWorkspace {...props}><Vendors /></LifecycleWorkspace></MemoryRouter>);
      const strip = screen.getByRole("navigation", { name: "Project procurement stages" });
      expect(strip.scrollLeft).toBe(780); strip.scrollTop = 71;
      width = 260; act(() => resize([], {} as ResizeObserver));
      expect(strip.scrollLeft).toBe(840); expect(strip.scrollTop).toBe(71);
      screen.getByRole("tab", { name: /Project Signoff/ }).focus(); await user.keyboard("{Home}");
      expect(strip.scrollLeft).toBe(0); expect(strip.scrollTop).toBe(71); expect(pageScroll).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Vendor appointment draft")).toBeVisible();
    } finally { globalThis.ResizeObserver = originalObserver; bounds.mockRestore(); pageScroll.mockRestore(); }
  });

  it("keeps five keyboard tabs, basket selection, browser history, and vendor drafts", async () => {
    install(); const user = userEvent.setup(); const view = workspace();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    await user.type(screen.getByLabelText("Vendor appointment draft"), "Keep this bid draft");
    const vendor = screen.getByRole("tab", { name: /Bids & Vendor Appointment/ }); vendor.focus(); await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Payments/ })).toHaveFocus();
    expect(await screen.findByRole("heading", { name: "Vendor payment workspace" })).toBeVisible();
    expect(screen.getByLabelText("Current query")).toHaveTextContent("basket=basket-a&tab=payments");
    expect(screen.getByRole("tab", { name: /Payments/ })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Back one page" }));
    expect(screen.getByLabelText("Vendor appointment draft")).toHaveValue("Keep this bid draft");
    vendor.focus(); await user.keyboard("{End}");
    expect(await screen.findByRole("heading", { name: "Project signoff" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Workshop A final payment is outstanding." })).toHaveAttribute("href", "/procurement/projects/project-a?basket=basket-a&tab=payments&entity=order-a");
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("clears protected lifecycle panels when project access is revoked", async () => {
    const fixture = install(); const user = userEvent.setup(); workspace(); await user.click(screen.getByRole("tab", { name: /Progress & Inspections/ }));
    await screen.findByText("Ceiling framework"); fixture.revoke(); await user.click(screen.getByRole("button", { name: "Refresh lifecycle" }));
    expect(await screen.findByText("This project information is no longer available to your account.")).toBeVisible();
    expect(screen.queryByText("Ceiling framework")).not.toBeInTheDocument();
  });

  it("records a not-started P1 check and unlocks P2 without requiring completion", async () => {
    const { data } = install(); const user = userEvent.setup(); let saved: Record<string, unknown> | undefined;
    server.use(http.post(`${path}/reviews/actions`, async ({ request }) => { saved = await request.json() as Record<string, unknown>; const observation = saved.observation as Record<string, unknown>;
      data.reviews.current!.members[0]!.check = { ...observation, id: "check-p1", roundId: "round-a", itemId: "item-1", revision: 1, correctionOf: null, correctionReason: null, sourceDigest: data.summary.sourceDigest, submittedAt: data.summary.serverNow, submittedById: "buyer-a", submittedByName: "Arun Procurement", late: false } as ProcurementProgressCheck;
      data.reviews.current!.version++; data.reviews.current!.checkedCount = 1; data.reviews.current!.members[1]!.canCheck = true; data.reviews.current!.members[1]!.blockingItemIds = [];
      return HttpResponse.json({ data: { ...data.reviews.current, checks: [], history: [] } }); }));
    renderWithQuery(<MemoryRouter><ProgressPanel {...props} summary={data.summary} /></MemoryRouter>);
    await user.click(await screen.findByLabelText(/^P2:/));
    const firstButtons = await screen.findAllByRole("button", { name: "Update work" }); expect(firstButtons[1]).toBeDisabled();
    await user.click(firstButtons[0]!); await user.selectOptions(screen.getByLabelText("Work status"), "not_started");
    await user.type(screen.getByLabelText("Work update notes"), "Access is ready; vendor starts tomorrow."); await user.type(screen.getByLabelText("Next action"), "Confirm crew arrival");
    await user.type(screen.getByLabelText("Next check date"), "2026-12-02"); await user.click(screen.getByRole("button", { name: "Save work update" }));
    await waitFor(() => expect(saved).toMatchObject({ action: "check", itemId: "item-1", expectedVersion: 1, observation: { status: "not_started", progress: null, nextAction: "Confirm crew arrival" } }));
    expect(saved!.idempotencyKey).toEqual(expect.any(String)); await waitFor(() => expect(screen.getAllByRole("button", { name: "Update work" })[0]).toBeEnabled());
    expect(screen.getByText("Access is ready; vendor starts tomorrow.")).toBeVisible();
  });

  it("retains a progress draft after a conflict and disables stale submission", async () => {
    const { data } = install(); const user = userEvent.setup();
    server.use(http.post(`${path}/reviews/actions`, () => { data.reviews.current!.version++; return HttpResponse.json({ error: { code: "PROCUREMENT_LIFECYCLE_CONFLICT", message: "Another person updated the round." } }, { status: 409 }); }));
    renderWithQuery(<MemoryRouter><ProgressPanel {...props} summary={data.summary} /></MemoryRouter>);
    await user.click((await screen.findAllByRole("button", { name: "Update work" }))[0]!); await user.type(screen.getByLabelText("Work update notes"), "Retain my observation"); await user.type(screen.getByLabelText("Next action"), "Recheck tomorrow"); await user.type(screen.getByLabelText("Next check date"), "2026-12-02");
    await user.click(screen.getByRole("button", { name: "Save work update" }));
    expect(await screen.findByText("Another person updated the round.")).toBeVisible(); expect(screen.getByLabelText("Work update notes")).toHaveValue("Retain my observation"); expect(screen.getByRole("button", { name: "Save work update" })).toBeDisabled();
  });

  it("counts project-wide visits and records multi-item inspection coverage", async () => {
    const { data } = install(); const user = userEvent.setup(); let saved: Record<string, unknown> | undefined;
    server.use(http.post(`${path}/inspections`, async ({ request }) => { saved = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: {} }); }));
    renderWithQuery(<MemoryRouter><InspectionsPanel {...props} summary={data.summary} /></MemoryRouter>);
    expect(await screen.findByText(/0 of 3 planned project visits recorded/)).toBeVisible(); await user.click(screen.getByRole("button", { name: "Record inspection" }));
    await user.click(screen.getByRole("checkbox", { name: /Ceiling framework/ })); await user.click(screen.getByRole("checkbox", { name: /Paint finish/ })); await user.type(screen.getByLabelText("Inspection notes"), "Inspected ceiling fixings and painted sample at site.");
    await user.click(screen.getByRole("button", { name: "Submit inspection" }));
    await waitFor(() => expect(saved).toMatchObject({ slotId: "slot-1", expectedVersion: 1, itemIds: ["item-1", "item-3"], notes: "Inspected ceiling fixings and painted sample at site." }));
    expect(saved!.visitId).toEqual(expect.stringMatching(/^proc-inspection-/));
  });

  it("does not offer N/A for mandatory quality and requires an assigned finding owner", async () => {
    const { data } = install(); const user = userEvent.setup(); let saved: Record<string, unknown> | undefined;
    server.use(http.post(`${path}/handover/actions`, async ({ request }) => { saved = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: data.handover }); }));
    renderWithQuery(<MemoryRouter><HandoverPanel {...props} summary={data.summary} /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Record outcome" }));
    expect(screen.queryByRole("option", { name: /Not applicable/ })).not.toBeInTheDocument(); expect(screen.getAllByText(/2 photo\(s\) per sample/)[0]).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Outcome"), "fail"); await user.type(screen.getByLabelText("Outcome notes"), "Finish sample is uneven; replace the affected panel.");
    await user.selectOptions(screen.getByLabelText("Responsible person"), "site-a"); await user.type(screen.getByLabelText("Corrective action due"), "2026-12-02T10:00"); await user.click(screen.getByRole("button", { name: "Save checklist outcome" }));
    await waitFor(() => expect(saved).toMatchObject({ action: "save", answers: [{ checkId: "check-a", answer: "fail", finding: { ownerId: "site-a" } }] }));
  });

  it("shows exact signoff blockers and never offers readiness when the server blocks it", async () => {
    const { data } = install(); renderWithQuery(<MemoryRouter><SignoffPanel {...props} /></MemoryRouter>);
    const link = await screen.findByRole("link", { name: data.readiness.blockers[0]!.message }); expect(link).toHaveAttribute("href", "/?tab=payments&entity=order-a"); expect(screen.queryByRole("button", { name: "Submit procurement readiness" })).not.toBeInTheDocument();
  });
});
