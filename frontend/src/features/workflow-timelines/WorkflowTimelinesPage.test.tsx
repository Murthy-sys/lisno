import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateWorkflowTimelines, defaultWorkflowTimelines, WORKFLOW_TIMELINE_BANDS,
  type UpdateWorkflowTimelines, type WorkflowTimelineConfiguration
} from "../../../../shared/projects/workflowTimelines";
import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { server } from "../../test/server";
import { WorkflowTimelinesPage } from "./WorkflowTimelinesPage";
import { workflowTimelineKeys } from "./workflowTimelinesApi";

const identity = vi.hoisted(() => ({ userId: "admin-one", sessionId: "session-one", canRead: true, canUpdate: true, role: "super_admin" as "super_admin" | "designer" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  status: "authenticated",
  user: { id: identity.userId, name: "Test administrator", email: "admin@example.test", role: identity.role },
  reviewSession: { id: identity.sessionId, userId: identity.userId },
  authorization: authorizationFor(identity.role, [
    ...(identity.canRead ? ["workflow_timelines.read" as const] : []),
    ...(identity.canUpdate ? ["workflow_timelines.update" as const] : [])
  ])
}) }));

let stored: WorkflowTimelineConfiguration;
let bodies: UpdateWorkflowTimelines[];
let getCalls: number;
const inputName = (phase = "Design", band = 0) => `${phase} workdays, ${WORKFLOW_TIMELINE_BANDS[band].label}, 0% base`;

function view(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const content = () => <QueryClientProvider client={client}><MemoryRouter><WorkflowTimelinesPage /></MemoryRouter></QueryClientProvider>;
  const rendered = render(content());
  return { ...rendered, client, rerenderPage: () => rendered.rerender(content()) };
}

function tableValues(name: string) {
  return within(screen.getByRole("table", { name })).getAllByRole("row").slice(1).map(row => {
    const cells = within(row).getAllByRole("cell");
    return [Number((within(cells[0]).getByRole("spinbutton") as HTMLInputElement).value), ...cells.slice(1).map(cell => Number(cell.textContent))];
  });
}

beforeEach(() => {
  identity.userId = "admin-one";
  identity.sessionId = "session-one";
  identity.canRead = true;
  identity.canUpdate = true;
  identity.role = "super_admin";
  tokenStorage.set("synthetic-timeline-session");
  stored = defaultWorkflowTimelines();
  bodies = [];
  getCalls = 0;
  server.use(
    http.get("/api/v1/admin/workflow-timelines", () => {
      getCalls++;
      return HttpResponse.json({ data: stored });
    }),
    http.put("/api/v1/admin/workflow-timelines", async ({ request }) => {
      const body = await request.json() as UpdateWorkflowTimelines;
      bodies.push(body);
      stored = { ...stored, bases: body.bases, matrices: calculateWorkflowTimelines(body.bases), version: stored.version + 1, updatedAt: "2026-11-27T09:00:00.000Z", createdAt: "2026-11-27T09:00:00.000Z", updatedById: identity.userId };
      return HttpResponse.json({ data: stored });
    })
  );
});

describe("Workflow timeline configuration", () => {
  it("renders all 56 supplied cells with only eight editable bases and accessible table scrolling", async () => {
    view();
    expect(screen.getByRole("status")).toHaveTextContent("Loading timelines");
    await screen.findByRole("spinbutton", { name: inputName() });
    expect(tableValues("Design workdays")).toEqual([[15, 17, 18, 20, 21, 23, 24], [20, 22, 24, 26, 28, 30, 32], [25, 28, 30, 33, 35, 38, 40], [30, 33, 36, 39, 42, 45, 48]]);
    expect(tableValues("Execution workdays")).toEqual([[40, 44, 48, 52, 56, 60, 64], [50, 55, 60, 65, 70, 75, 80], [70, 77, 84, 91, 98, 105, 112], [80, 88, 96, 104, 112, 120, 128]]);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Save timelines" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
    expect(screen.getByRole("region", { name: /Design workdays table/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("link", { name: "Back to Configuration" })).toHaveAttribute("href", "/admin/configuration/estimation");
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("link", { name: "Back to Configuration" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("region", { name: /Design workdays table/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("spinbutton", { name: inputName() })).toHaveFocus();
  });

  it("recalculates isolated rows, saves all bases and retains saved values after revisiting", async () => {
    const user = userEvent.setup();
    const page = view();
    const design = await screen.findByRole("spinbutton", { name: inputName() });
    const execution = screen.getByRole("spinbutton", { name: inputName("Execution", 2) });
    await user.clear(design); await user.type(design, "17");
    await user.clear(execution); await user.type(execution, "73");
    expect(tableValues("Design workdays")[0]).toEqual([17, 19, 21, 23, 24, 26, 28]);
    expect(tableValues("Execution workdays")[2]).toEqual([73, 81, 88, 95, 103, 110, 117]);
    expect(tableValues("Design workdays")[1]).toEqual([20, 22, 24, 26, 28, 30, 32]);
    await user.click(screen.getByRole("button", { name: "Save timelines" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Timelines saved."));
    expect(bodies).toEqual([{ expectedVersion: 0, bases: stored.bases }]);
    expect(bodies[0].bases).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Save timelines" })).toBeDisabled();
    page.unmount();
    view(page.client);
    expect(await screen.findByRole("spinbutton", { name: inputName() })).toHaveValue(17);
    expect(screen.getByRole("spinbutton", { name: inputName("Execution", 2) })).toHaveValue(73);
  });

  it("discards edits and rejects empty, fractional and out-of-range inputs", async () => {
    const user = userEvent.setup();
    view();
    const input = await screen.findByRole("spinbutton", { name: inputName() });
    for (const value of ["", "0", "1.5", "3651"]) {
      await user.clear(input); if (value) await user.type(input, value);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription("Enter a whole number from 1 to 3650.");
      expect(screen.getByRole("button", { name: "Save timelines" })).toBeDisabled();
    }
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(input).toHaveValue(15);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(bodies).toHaveLength(0);
  });

  it("does not replace an unsaved draft when a newer version is fetched", async () => {
    const user = userEvent.setup();
    const { client } = view();
    const input = await screen.findByRole("spinbutton", { name: inputName() });
    await user.clear(input); await user.type(input, "19");
    const newer = defaultWorkflowTimelines(); newer.version = 2; newer.bases[0].designWorkdays = 22; newer.matrices = calculateWorkflowTimelines(newer.bases);
    act(() => client.setQueryData(workflowTimelineKeys.detail(identity.userId, identity.sessionId, authorizationFor("super_admin").policyVersion), newer));
    expect(input).toHaveValue(19);
    expect(await screen.findByRole("alert")).toHaveTextContent("updated by another session");
    expect(screen.getByRole("button", { name: "Save timelines" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(input).toHaveValue(22);
  });

  it("preserves a rejected save and resolves conflicts only through an explicit reload", async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(http.put("/api/v1/admin/workflow-timelines", () => {
      if (fail) return HttpResponse.json({ error: { code: "SAVE_FAILED", message: "Please retry." } }, { status: 503 });
      stored.version = 1; stored.bases[0].designWorkdays = 28; stored.matrices = calculateWorkflowTimelines(stored.bases);
      return HttpResponse.json({ error: { code: "WORKFLOW_TIMELINES_VERSION_CONFLICT", message: "Timelines changed." } }, { status: 409 });
    }));
    view();
    const input = await screen.findByRole("spinbutton", { name: inputName() });
    await user.clear(input); await user.type(input, "23");
    await user.click(screen.getByRole("button", { name: "Save timelines" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry.");
    expect(input).toHaveValue(23);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Save timelines" }));
    await screen.findByRole("button", { name: "Discard changes and reload" });
    await user.clear(input); await user.type(input, "24");
    expect(screen.getByRole("button", { name: "Save timelines" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard changes and reload" }));
    await waitFor(() => expect(input).toHaveValue(28));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a retryable load failure without presenting default values as saved", async () => {
    let fail = true;
    server.use(http.get("/api/v1/admin/workflow-timelines", () => fail ? HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Try again." } }, { status: 503 }) : HttpResponse.json({ data: stored })));
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("Timelines could not be loaded");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry timelines" }));
    expect(await screen.findByRole("spinbutton", { name: inputName() })).toHaveValue(15);
  });

  it("enforces read and update visibility and clears displayed data on loss of access", async () => {
    identity.canUpdate = false;
    const page = view();
    expect(await screen.findByRole("spinbutton", { name: inputName() })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save timelines" })).not.toBeInTheDocument();
    identity.canRead = false;
    page.rerenderPage();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("do not have access");
    expect(getCalls).toBe(1);
  });

  it("does not fetch or display timelines for another role even if a stale permission is present", () => {
    identity.role = "designer";
    view();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("do not have access");
    expect(getCalls).toBe(0);
  });

  it.each(["same-user", "different-user"])("does not reuse a former session's draft or mutation result after a %s session change", async session => {
    const user = userEvent.setup();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    server.use(http.put("/api/v1/admin/workflow-timelines", async ({ request }) => {
      const body = await request.json() as UpdateWorkflowTimelines;
      await pending;
      return HttpResponse.json({ data: { ...stored, version: 3, bases: body.bases, matrices: calculateWorkflowTimelines(body.bases) } });
    }));
    const page = view();
    const input = await screen.findByRole("spinbutton", { name: inputName() });
    await user.clear(input); await user.type(input, "35");
    await user.click(screen.getByRole("button", { name: "Save timelines" }));
    expect(input).toBeDisabled();
    if (session === "different-user") identity.userId = "admin-two";
    identity.sessionId = "session-two";
    page.rerenderPage();
    expect(await screen.findByRole("spinbutton", { name: inputName() })).toHaveValue(15);
    await act(async () => { finish(); await pending; });
    expect(screen.getByRole("spinbutton", { name: inputName() })).toHaveValue(15);
    expect(page.client.getQueryData<WorkflowTimelineConfiguration>(workflowTimelineKeys.detail(identity.userId, identity.sessionId, authorizationFor("super_admin").policyVersion))?.version).toBe(0);
  });
});
