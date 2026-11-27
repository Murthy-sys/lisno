import { useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../test/server";
import { lifecycleFixtures } from "./lifecycleFixtures.test-support";
import { lifecycleKeys, type ProcurementProgressCheck } from "./lifecycleApi";
import { ProgressPanel } from "./ProgressPanel";
import { LifecycleWorkspace } from "./LifecycleWorkspace";
import { TargetRecord } from "./LifecycleShared";

const path = "/api/v1/procurement/projects/project-a/lifecycle";
const props = { projectId: "project-a", actorId: "buyer-a" };
function install() {
  const data = lifecycleFixtures();
  server.use(http.get(`${path}/reviews`, () => HttpResponse.json({ data: data.reviews })),
    http.get(`${path}/inspections`, () => HttpResponse.json({ data: data.inspections })));
  return data;
}
function Commands() {
  const client = useQueryClient(); const navigate = useNavigate(); const location = useLocation();
  return <><button onClick={() => void client.invalidateQueries({ queryKey: lifecycleKeys.all })}>Refresh reviews</button>
    <button onClick={() => navigate("?tab=progress&basket=keep&entity=item-3")}>Open linked P3 item</button>
    <button onClick={() => navigate("?tab=payments&entity=item-3")}>Open another tab</button>
    <output aria-label="Current query">{location.search}</output></>;
}
function setup(data: ReturnType<typeof lifecycleFixtures>, initial = "/?tab=progress", audience?: "admin") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><Commands />
    <div className="lc-workspace"><ProgressPanel {...props} audience={audience} summary={data.summary} /></div>
  </MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}
const header = (priority: string) => screen.getByLabelText(new RegExp(`^${priority}:`));
const group = (priority: string) => header(priority).closest("details")!;
function check(data: ReturnType<typeof lifecycleFixtures>, index: number, status: ProcurementProgressCheck["status"] = "not_started") {
  const member = data.reviews.current!.members[index]!;
  member.check = { id: `check-${member.item.id}`, roundId: data.reviews.current!.id, itemId: member.item.id, revision: 1,
    correctionOf: null, correctionReason: null, sourceDigest: data.reviews.sourceDigest, submittedAt: data.summary.serverNow,
    submittedById: props.actorId, submittedByName: "Procurement reviewer", checkedAt: data.summary.serverNow, late: false,
    status, progress: status === "not_started" ? 0 : 25, notes: "Observed work", nextAction: "Follow up with vendor", nextCheckDate: "2026-12-02",
    delayed: status === "blocked", delayReason: status === "blocked" ? "Access restricted" : null, responsibleParty: status === "blocked" ? "Site team" : null,
    recoveryAction: status === "blocked" ? "Arrange access" : null, recoveryDate: status === "blocked" ? "2026-12-02" : null, forecastDate: null, forecastReason: null };
  member.canCheck = false;
  data.reviews.current!.checkedCount = data.reviews.current!.members.filter(row => row.check).length;
}

describe("Progress priority panels", () => {
  it("shows ordered native disclosures with truthful counts, opens P1 first and keeps independent choices on refresh", async () => {
    const data = install(); const extra = { ...data.reviews.current!.members[0]!, item: { ...data.summary.source.items[0]!, id: "item-extra", itemName: "Kitchen framework" } };
    data.reviews.current!.members.push(extra); data.reviews.current!.requiredCount++;
    check(data, 0);
    const user = userEvent.setup(); const view = setup(data);
    await screen.findByText("Kitchen framework");
    expect(Array.from(view.container.querySelectorAll(".lc-priority > summary")).map(node => node.textContent?.slice(0, 2))).toEqual(["P1", "P2", "P3"]);
    expect(header("P1")).toHaveAccessibleName(/2 items · 1 of 2 checked/);
    expect(group("P1")).toHaveAttribute("open"); expect(group("P2")).not.toHaveAttribute("open"); expect(group("P3")).not.toHaveAttribute("open");
    await user.click(header("P2")); await user.click(header("P1")); await user.click(screen.getByRole("button", { name: "Refresh reviews" }));
    await waitFor(() => expect(view.client.isFetching()).toBe(0));
    expect(group("P1")).not.toHaveAttribute("open"); expect(group("P2")).toHaveAttribute("open");
    expect(within(group("P2")).getByRole("button", { name: "Update work" })).toBeDisabled();
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it.each(["setup", "no-round"])("shows read-only appointed previews in %s and does not write when expanding", async state => {
    const data = install(); data.reviews.current = null;
    if (state === "setup") { data.summary.state = null; data.summary.availability = "setup_required"; data.summary.allowedActions = ["setup"]; }
    else data.reviews.allowedActions = ["open"];
    const writes = vi.fn(); server.use(http.post(`${path}/reviews/actions`, () => { writes(); return HttpResponse.json({ data: {} }); }),
      http.post(`${path}/setup`, () => { writes(); return HttpResponse.json({ data: {} }); }));
    const user = userEvent.setup(); setup(data); await screen.findByText("Ceiling framework");
    expect(header("P1")).not.toHaveAccessibleName(/checked/); expect(screen.queryByRole("button", { name: "Update work" })).not.toBeInTheDocument();
    await user.click(header("P2")); expect(screen.getByText("Joinery installation")).toBeVisible();
    expect(screen.queryByLabelText("Review interval (days)")).not.toBeInTheDocument();
    if (state === "setup") {
      const disclosure = screen.getByText("Set up project checks", { selector: "summary" });
      await user.click(disclosure); await user.type(await screen.findByLabelText("Reason"), "Keep this policy draft");
      await user.click(disclosure); await user.click(disclosure);
      expect(screen.getByLabelText("Reason")).toHaveValue("Keep this policy draft");
    }
    expect(writes).not.toHaveBeenCalled();
  });

  it("keeps empty P1 visible while respecting eligible P2 and unresolved priorities", async () => {
    const data = install(); data.reviews.current!.members.shift(); data.reviews.current!.requiredCount--;
    data.reviews.current!.members[0]!.canCheck = true; data.reviews.current!.members[0]!.blockingItemIds = [];
    data.reviews.current!.members.push({ ...data.reviews.current!.members[0]!, item: { ...data.summary.source.items[0]!, id: "unresolved", priority: null }, canCheck: false });
    const user = userEvent.setup(); setup(data); await screen.findByText("No P1 items in this review round.");
    expect(header("P1")).toHaveAccessibleName(/0 items · 0 of 0 checked/);
    await user.click(header("P2")); expect(within(group("P2")).getByRole("button", { name: "Update work" })).toBeEnabled();
    await user.click(header("Priority not set")); expect(within(group("Priority not set")).getByRole("button", { name: "Update work" })).toBeDisabled();
  });

  it.each(["not_started", "blocked"] as const)("waits for all P1 observations but accepts %s work when the server unlocks P2", async status => {
    const data = install(); const round = data.reviews.current!;
    const second = { ...round.members[0]!, item: { ...round.members[0]!.item, id: "second-p1", itemName: "Kitchen framework" } };
    round.members.splice(1, 0, second); round.requiredCount++;
    check(data, 0, status); round.members[2]!.blockingItemIds = ["second-p1"];
    const user = userEvent.setup(); const view = setup(data); await screen.findByText("Kitchen framework");
    await user.click(header("P2")); expect(within(group("P2")).getByRole("button", { name: "Update work" })).toBeDisabled();
    check(data, 1, status); round.version++; round.members[2]!.canCheck = true; round.members[2]!.blockingItemIds = [];
    await user.click(screen.getByRole("button", { name: "Refresh reviews" })); await waitFor(() => expect(view.client.isFetching()).toBe(0));
    await waitFor(() => expect(within(group("P2")).getByRole("button", { name: "Update work" })).toBeEnabled());
    expect(header("P1")).toHaveAccessibleName(/2 of 2 checked.*Checks recorded/);
    expect(data.reviews.current!.members.filter(member => member.check).every(member => member.check!.status !== "completed")).toBe(true);
  });

  it("retains an observation draft through collapsing, other group toggles and a stale source refresh", async () => {
    const data = install(); const user = userEvent.setup(); const view = setup(data);
    await screen.findByText("Ceiling framework");
    await user.click(within(group("P1")).getByRole("button", { name: "Update work" }));
    await user.type(screen.getByLabelText("Work update notes"), "Retain this observation");
    await user.click(header("P1")); await user.click(header("P2")); await user.click(header("P1"));
    expect(screen.getByLabelText("Work update notes")).toHaveValue("Retain this observation");
    data.reviews.current!.version++; data.reviews.current!.sourceChanged = true; data.reviews.current!.allowedActions = ["reconcile", "pause"];
    // The current source changes priority, but the round's saved membership is unchanged.
    data.summary.source.items = data.summary.source.items.map(item => ({ ...item, priority: "P3" }));
    await user.click(screen.getByRole("button", { name: "Refresh reviews" })); await waitFor(() => expect(view.client.isFetching()).toBe(0));
    expect(screen.getByLabelText("Work update notes")).toHaveValue("Retain this observation");
    expect(screen.getByRole("button", { name: "Save work update" })).toBeDisabled();
    expect(within(group("P1")).getByText("Ceiling framework")).toBeVisible();
    expect(header("P1")).toHaveAccessibleName(/1 item · 0 of 1 checked.*Reconcile source changes/);
  });

  it("resets a draft and disclosure defaults for a new review round", async () => {
    const data = install(); const user = userEvent.setup(); setup(data);
    await screen.findByText("Ceiling framework");
    await user.click(within(group("P1")).getByRole("button", { name: "Update work" }));
    await user.type(screen.getByLabelText("Work update notes"), "Previous round draft"); await user.click(header("P2"));
    data.reviews.current!.id = "round-next"; data.reviews.current!.sequence++;
    await user.click(screen.getByRole("button", { name: "Refresh reviews" })); await screen.findByRole("heading", { name: "Review round 2" });
    expect(group("P1")).toHaveAttribute("open"); expect(group("P2")).not.toHaveAttribute("open");
    expect(screen.queryByLabelText("Work update notes")).not.toBeInTheDocument();
    await user.click(within(group("P1")).getByRole("button", { name: "Update work" })); expect(screen.getByLabelText("Work update notes")).toHaveValue("");
  });

  it("reveals and focuses a deep-linked P3 record, permits collapse, and reopens only on navigation", async () => {
    const data = install(); const user = userEvent.setup(); const view = setup(data, "/?tab=progress&basket=keep&entity=item-3");
    await waitFor(() => expect(group("P3")).toHaveAttribute("open"));
    expect(document.activeElement).toHaveAttribute("id", "lc-item-3");
    await user.click(header("P3")); expect(group("P3")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Refresh reviews" })); await waitFor(() => expect(view.client.isFetching()).toBe(0));
    expect(group("P3")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Open linked P3 item" }));
    await waitFor(() => expect(group("P3")).toHaveAttribute("open")); expect(document.activeElement).toHaveAttribute("id", "lc-item-3");
    expect(screen.getByLabelText("Current query")).toHaveTextContent("basket=keep");
  });

  it("does not reveal or focus a targeted record inside a retained hidden tab", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/?tab=payments&entity=item-3"]}><Commands />
      <section hidden><details><summary>Hidden priority</summary><TargetRecord id="item-3">Hidden record</TargetRecord></details></section>
    </MemoryRouter></QueryClientProvider>);
    const button = screen.getByRole("button", { name: "Open another tab" }); await user.click(button);
    expect(document.activeElement).toBe(button); expect(screen.getByText("Hidden priority").closest("details")).not.toHaveAttribute("open");
  });

  it.each(["projected", "paused", "submitted", "admin", "unavailable"])("retains restrictions in the %s state", async state => {
    const data = install();
    if (state === "projected") data.reviews.current!.version = 0;
    if (state === "paused") { data.reviews.current!.status = "paused"; data.reviews.current!.allowedActions = ["resume"]; }
    if (state === "submitted") { data.reviews.current!.status = "submitted"; data.reviews.current!.allowedActions = []; }
    if (state === "admin") { data.reviews.current!.allowedActions = []; data.summary.allowedActions = []; }
    if (state === "unavailable") { data.summary.source.available = false; check(data, 0); }
    if (state === "admin") server.use(http.get("/api/v1/admin/projects/project-a/procurement-lifecycle/reviews", () => HttpResponse.json({ data: data.reviews })), http.get("/api/v1/admin/projects/project-a/procurement-lifecycle/inspections", () => HttpResponse.json({ data: data.inspections })));
    setup(data, "/?tab=progress", state === "admin" ? "admin" : undefined); await screen.findByText("Ceiling framework");
    for (const button of within(group("P1")).queryAllByRole("button")) expect(button).toBeDisabled();
    if (state === "projected") expect(header("P1")).toHaveAccessibleName(/Open review to record checks/);
    if (state === "unavailable") expect(header("P1")).toHaveAccessibleName(/1 of 1 checked.*Appointed work unavailable/);
    if (state === "admin") expect(within(group("P1")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not display an unavailable preview as empty appointed work", async () => {
    const data = install(); data.reviews.current = null; data.summary.source.available = false; data.summary.source.items = [];
    setup(data); await screen.findByRole("heading", { name: "Appointed items" });
    expect(header("P1")).toHaveAccessibleName(/Items unavailable/); expect(header("P1")).not.toHaveAccessibleName(/0 items/);
    expect(screen.queryByText(/No P1 items/)).not.toBeInTheDocument();
  });

  it("removes preview and protected item content after review access is revoked, even with a cached summary", async () => {
    const data = install(); data.reviews.current = null; const user = userEvent.setup(); setup(data);
    await screen.findByText("Ceiling framework");
    server.use(http.get(`${path}/reviews`, () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Assignment revoked" } }, { status: 403 })));
    await user.click(screen.getByRole("button", { name: "Refresh reviews" }));
    await screen.findByText("This project information is no longer available to your account.");
    expect(screen.queryByText("Ceiling framework")).not.toBeInTheDocument(); expect(screen.queryByLabelText(/^P1:/)).not.toBeInTheDocument();
  });

  it("keeps recorded checks visible but disabled after a refresh error", async () => {
    const data = install(); const user = userEvent.setup(); const view = setup(data);
    await screen.findByText("Ceiling framework");
    server.use(http.get(`${path}/reviews`, () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Temporary interruption" } }, { status: 503 })));
    await user.click(screen.getByRole("button", { name: "Refresh reviews" }));
    await waitFor(() => expect(view.client.isFetching()).toBe(0), { timeout: 3000 });
    expect(screen.getByText("Ceiling framework")).toBeVisible(); expect(within(group("P1")).getByRole("button", { name: "Update work" })).toBeDisabled();
    expect(header("P1")).toHaveAccessibleName(/Refresh before recording checks/);
  });
});


function liveSetup(data: ReturnType<typeof lifecycleFixtures>) {
  server.use(http.get(path, () => HttpResponse.json({ data: data.summary })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function IdentityWorkspace() {
    const [actorId, setActorId] = useState(props.actorId);
    return <><button onClick={() => setActorId("buyer-b")}>Switch actor</button><LifecycleWorkspace {...props} actorId={actorId} /></>;
  }
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/?tab=progress&basket=keep"]}><Commands /><IdentityWorkspace /></MemoryRouter></QueryClientProvider>) };
}
function setupRequired(data: ReturnType<typeof lifecycleFixtures>) {
  const saved = structuredClone(data);
  data.summary.state = null; data.summary.version = 0; data.summary.availability = "setup_required"; data.summary.allowedActions = ["setup"];
  data.reviews.current = null;
  return () => { Object.assign(data.summary, saved.summary); data.reviews.current = saved.reviews.current; };
}

async function fillWorkUpdate(user: ReturnType<typeof userEvent.setup>, status = "in_progress") {
  await user.selectOptions(screen.getByLabelText("Work status"), status);
  await user.type(screen.getByLabelText("Work update notes"), "Checked the work on site");
  await user.type(screen.getByLabelText("Next action"), "Follow up with the vendor");
  await user.type(screen.getByLabelText("Next check date"), "2026-12-02");
  if (status === "blocked") {
    await user.type(screen.getByLabelText("Delay reason"), "Access is restricted");
    await user.type(screen.getByLabelText("Responsible party"), "Site team");
    await user.type(screen.getByLabelText("Recovery action"), "Arrange access");
    await user.type(screen.getByLabelText("Expected recovery date"), "2026-12-02");
  }
}

describe("Inline work updates", () => {
  it.each(["not_started", "in_progress", "blocked", "completed"])("saves %s without percentages and preserves an exact observation timestamp", async status => {
    const data = install(); const user = userEvent.setup(); const exact = "2026-11-28T10:00:45.123Z";
    data.reviews.current!.opensAt = exact;
    let saved: Record<string, unknown> | undefined;
    server.use(http.post(path + "/reviews/actions", async ({ request }) => {
      saved = await request.json() as Record<string, unknown>;
      data.reviews.current!.members[0]!.check = { ...(saved.observation as ProcurementProgressCheck), id: "saved-check", itemId: "item-1", roundId: "round-a", revision: 1, correctionOf: null, correctionReason: null, sourceDigest: data.summary.sourceDigest, submittedAt: exact, submittedById: props.actorId, submittedByName: "Procurement reviewer", late: false };
      data.reviews.current!.version++;
      return HttpResponse.json({ data: { ...data.reviews.current, checks: [], history: [] } });
    }));
    const view = setup(data); await screen.findByText("Ceiling framework");
    expect(view.container.querySelector(".lc-priorities")!.textContent).not.toContain("%");
    const now = vi.spyOn(Date, "now").mockReturnValue(new Date(exact).getTime());
    const NativeDate = Date;
    const mockDate = class extends NativeDate { constructor(value?: string | number) { super(value ?? exact); } };
    vi.stubGlobal("Date", mockDate);
    try { await user.click(within(group("P1")).getByRole("button", { name: "Update work" })); }
    finally { vi.unstubAllGlobals(); now.mockRestore(); }
    expect(screen.queryByLabelText(/progress.*%/i)).not.toBeInTheDocument();
    await fillWorkUpdate(user, status); await user.click(screen.getByRole("button", { name: "Save work update" }));
    await screen.findByText("Work update saved.");
    expect(saved).toMatchObject({ action: "check", itemId: "item-1", roundId: "round-a", expectedVersion: 1, sourceDigest: data.summary.sourceDigest,
      observation: { status, progress: null, checkedAt: exact, notes: "Checked the work on site", delayed: status === "blocked" } });
    expect(group("P1")).toHaveAttribute("open"); expect(screen.getByText("Checked the work on site")).toBeVisible();
  });

  it("amends an older numeric observation with null progress while retaining the original revision", async () => {
    const data = install(); check(data, 0, "in_progress"); const original = structuredClone(data.reviews.current!.members[0]!.check!); const user = userEvent.setup();
    let saved: Record<string, unknown> | undefined;
    server.use(http.post(path + "/reviews/actions", async ({ request }) => { saved = await request.json() as Record<string, unknown>; return HttpResponse.json({ data: { ...data.reviews.current, checks: [original], history: [] } }); }));
    setup(data); await user.click(await screen.findByRole("button", { name: "Amend work update" }));
    await user.selectOptions(screen.getByLabelText("Work status"), "completed"); await user.type(screen.getByLabelText("Correction reason"), "Work completed after the earlier visit");
    await user.click(screen.getByRole("button", { name: "Save amended work update" }));
    await waitFor(() => expect(saved).toMatchObject({ action: "correct", itemId: "item-1", checkId: original.id, reason: "Work completed after the earlier visit", observation: { status: "completed", progress: null, checkedAt: original.checkedAt } }));
    expect(data.reviews.current!.members[0]!.check).toEqual(original); expect(original.progress).toBe(25);
  });

  it.each(["P1", "P2"])("returns from explicit setup to the selected %s item's action or blocker without an observation write", async priority => {
    const data = install(); const activate = setupRequired(data); const user = userEvent.setup(); const writes: unknown[] = [];
    server.use(http.post(path + "/setup", async ({ request }) => { writes.push(await request.json()); activate(); return HttpResponse.json({ data: data.summary }); }),
      http.post(path + "/reviews/actions", () => { throw new Error("Setup must not write an observation"); }));
    liveSetup(data); await screen.findByText("Ceiling framework");
    if (priority === "P2") await user.click(header("P2"));
    await user.click(within(group(priority)).getByRole("button", { name: "Set up to update work" }));
    await waitFor(() => expect(screen.getByLabelText("Review interval (days)")).toHaveFocus());
    expect(writes).toHaveLength(0); expect(screen.getAllByLabelText("Reason")).toHaveLength(1);
    await user.type(screen.getByLabelText("Reason"), "Start regular project checks"); await user.click(screen.getByRole("button", { name: "Set up procurement lifecycle" }));
    await waitFor(() => expect(within(group(priority)).getByRole("button", { name: "Update work" })).toBeInTheDocument());
    if (priority === "P1") await waitFor(() => expect(within(group("P1")).getByRole("button", { name: "Update work" })).toHaveFocus());
    else { await waitFor(() => expect(within(group("P2")).getByText(/First record:/)).toHaveFocus()); expect(within(group("P2")).getByRole("button", { name: "Update work" })).toBeDisabled(); }
    expect(writes).toHaveLength(1); expect(screen.getByLabelText("Current query")).toHaveTextContent("basket=keep");
  });

  it.each(["absent", "projected"])("opens a %s review explicitly and returns to the selected item", async state => {
    const data = install(); const savedRound = structuredClone(data.reviews.current!); data.reviews.allowedActions = ["open"];
    if (state === "absent") data.reviews.current = null; else data.reviews.current!.version = 0;
    const user = userEvent.setup(); const writes: unknown[] = [];
    server.use(http.post(path + "/reviews/actions", async ({ request }) => { writes.push(await request.json()); data.reviews.current = savedRound; data.reviews.allowedActions = []; return HttpResponse.json({ data: { ...savedRound, checks: [], history: [] } }); }));
    liveSetup(data); await screen.findByText("Ceiling framework");
    await user.click(within(group("P1")).getByRole("button", { name: "Start review to update work" }));
    await waitFor(() => expect(within(group("P1")).getByRole("button", { name: "Update work" })).toHaveFocus());
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ action: "open", expectedVersion: 0, sourceDigest: data.summary.sourceDigest });
  });

  it("retains failed setup's policy draft and selected item for an explicit retry", async () => {
    const data = install(); const activate = setupRequired(data); const user = userEvent.setup(); let attempts = 0;
    server.use(http.post(path + "/setup", () => { if (++attempts === 1) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Setup unavailable" } }, { status: 503 }); activate(); return HttpResponse.json({ data: data.summary }); }));
    liveSetup(data); await screen.findByText("Ceiling framework"); await user.click(within(group("P1")).getByRole("button", { name: "Set up to update work" }));
    await user.type(await screen.findByLabelText("Reason"), "Keep this setup explanation"); await user.click(screen.getByRole("button", { name: "Set up procurement lifecycle" }));
    await screen.findByText("Setup unavailable"); expect(screen.getByLabelText("Reason")).toHaveValue("Keep this setup explanation");
    await user.click(screen.getByRole("button", { name: "Set up procurement lifecycle" }));
    await waitFor(() => expect(within(group("P1")).getByRole("button", { name: "Update work" })).toHaveFocus()); expect(attempts).toBe(2);
  });

  it("does not continue to a different assignment with the same item name", async () => {
    const data = install(); const activate = setupRequired(data); const user = userEvent.setup();
    server.use(http.post(path + "/setup", () => { activate(); data.reviews.current!.members[0]!.item.id = "replacement-assignment"; return HttpResponse.json({ data: data.summary }); }));
    liveSetup(data); await screen.findByText("Ceiling framework"); await user.click(within(group("P1")).getByRole("button", { name: "Set up to update work" }));
    await user.type(await screen.findByLabelText("Reason"), "Start regular checks"); await user.click(screen.getByRole("button", { name: "Set up procurement lifecycle" }));
    await screen.findByText("The selected item is no longer in this review. Choose an item from the current appointed work.");
    expect(within(group("P1")).getByRole("button", { name: "Update work" })).not.toHaveFocus();
  });

  it("ignores an old actor's delayed open response after identity changes", async () => {
    const data = install(); const round = structuredClone(data.reviews.current!); data.reviews.current = null; data.reviews.allowedActions = ["open"];
    const user = userEvent.setup(); let finish!: () => void;
    server.use(http.post(path + "/reviews/actions", async () => { await new Promise<void>(resolve => { finish = resolve; }); data.reviews.current = round; data.reviews.allowedActions = []; return HttpResponse.json({ data: { ...round, checks: [], history: [] } }); }));
    liveSetup(data); await screen.findByText("Ceiling framework"); await user.click(within(group("P1")).getByRole("button", { name: "Start review to update work" }));
    await waitFor(() => expect(finish).toBeDefined()); await user.click(screen.getByRole("button", { name: "Switch actor" }));
    await act(async () => finish());
    await waitFor(() => expect(within(group("P1")).getByRole("button", { name: "Update work" })).toBeVisible());
    expect(within(group("P1")).getByRole("button", { name: "Update work" })).not.toHaveFocus(); expect(screen.getByRole("button", { name: "Switch actor" })).toHaveFocus();
  });

  it("waits for a successful review refresh after setup before continuing to the item", async () => {
    const data = install(); const activate = setupRequired(data); const user = userEvent.setup(); let failRefresh = false; let setupWrites = 0;
    server.use(http.get(path + "/reviews", () => failRefresh
      ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Review refresh failed" } }, { status: 503 })
      : HttpResponse.json({ data: data.reviews })),
    http.post(path + "/setup", () => { setupWrites++; activate(); failRefresh = true; return HttpResponse.json({ data: data.summary }); }));
    const view = liveSetup(data); await screen.findByText("Ceiling framework");
    await user.click(within(group("P1")).getByRole("button", { name: "Set up to update work" }));
    await user.type(await screen.findByLabelText("Reason"), "Initialize the project review");
    await user.click(screen.getByRole("button", { name: "Set up procurement lifecycle" }));
    await screen.findAllByText(/Review refresh failed/, {}, { timeout: 3000 });
    expect(within(group("P1")).queryByRole("button", { name: "Update work" })).not.toBeInTheDocument();
    expect(setupWrites).toBe(1);
    failRefresh = false;
    await act(async () => { await view.client.invalidateQueries({ queryKey: lifecycleKeys.all }); });
    await waitFor(() => expect(within(group("P1")).getByRole("button", { name: "Update work" })).toHaveFocus());
    expect(setupWrites).toBe(1);
  });

  it("does not continue into an unrelated round returned by the refresh", async () => {
    const data = install(); const opened = structuredClone(data.reviews.current!); const user = userEvent.setup();
    data.reviews.current = null; data.reviews.allowedActions = ["open"];
    server.use(http.post(path + "/reviews/actions", () => {
      data.reviews.current = { ...structuredClone(opened), id: "unrelated-round", sequence: 2 }; data.reviews.allowedActions = [];
      return HttpResponse.json({ data: { ...opened, checks: [], history: [] } });
    }));
    liveSetup(data); await screen.findByText("Ceiling framework");
    await user.click(within(group("P1")).getByRole("button", { name: "Start review to update work" }));
    const notice = await screen.findByText("The review changed while preparing this item. Choose the item again in the current review.");
    expect(notice).toHaveFocus();
    expect(within(group("P1")).getByRole("button", { name: "Update work" })).not.toHaveFocus();
  });
});
