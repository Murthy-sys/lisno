import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import type { Role } from "../../api/types";
import { DesignerAssignmentInbox } from "./DesignerAssignmentInbox";
import { designerAssignmentKeys } from "./designerAssignmentApi";

const access = vi.hoisted(() => ({ canRead: true, canDecide: true, id: "designer-one", role: "designer" as Role, session: "" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: access.id, role: access.role }, reviewSession: { id: access.session }, authorization: authorizationFor(access.role, [
  ...(access.canRead ? ["design.assignment_requests.read" as const] : []), ...(access.canDecide ? ["design.assignment_requests.decide" as const] : [])
]) }) }));
const request = { id: "request-one", projectId: "project-1", projectName: "Harbour Home", projectLocation: "Pune", preferredLanguage: "english", scopeSummary: { itemCount: 8, sectionCount: 3, roomCount: 2 }, status: "pending", version: 4, createdAt: "2026-11-25T09:00:00Z", decidedAt: null, canDecide: true, blockedReason: null, closureReason: null };
const inboxUrl = "/api/v1/designer/assignment-requests";
const decisionUrl = `${inboxUrl}/request-one/decision`;
const page = (items = [request], total = items.length, offset = 0) => HttpResponse.json({ data: {
  items, pagination: { limit: 20, offset, total, hasMore: offset + 20 < total }
} });
function renderInbox(element = <DesignerAssignmentInbox />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><FeedbackProvider>{children}</FeedbackProvider></QueryClientProvider>;
  return { client, ...render(element, { wrapper }) };
}
async function openInbox(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /^Assignment requests/ }));
  await screen.findByRole("dialog", { name: "Assignment requests" });
}
beforeEach(() => { access.canRead = true; access.canDecide = true; access.id = "designer-one"; access.role = "designer"; access.session = ""; });

describe("DesignerAssignmentInbox", () => {
  it("shows only the safe preview and accepts with the request version", async () => {
    let body: unknown; const details = vi.fn();
    server.use(
      http.get("/api/v1/designer/assignment-requests", () => HttpResponse.json({ data: { items: [request], pagination: { limit: 20, offset: 0, total: 1, hasMore: false } } })),
      http.get("/api/v1/projects/project-1", details),
      http.post("/api/v1/designer/assignment-requests/request-one/decision", async ({ request: req }) => { body = await req.json(); return HttpResponse.json({ data: { ...request, status: "accepted", version: 5 } }); })
    );
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup(); renderWithQuery(<DesignerAssignmentInbox />);
    expect(screen.queryByText("Harbour Home")).not.toBeInTheDocument();
    await openInbox(user);
    expect(await screen.findByText("Harbour Home")).toBeVisible();
    expect(screen.getByText("8 items · 3 sections · 2 rooms")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(details).not.toHaveBeenCalled();
    const accept = screen.getByRole("button", { name: "Accept assignment for Harbour Home" }); await waitFor(() => expect(accept).toBeEnabled()); accept.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(body).toEqual({ expectedVersion: 4, decision: "accept", idempotencyKey: expect.any(String) }));
    expect(await screen.findByText("Assignment accepted. Your project is now available in Assigned projects.")).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-workflow"] }); invalidate.mockRestore();
  });

  it("allows decline and keeps a stale decision disabled until explicit refresh", async () => {
    server.use(http.get("/api/v1/designer/assignment-requests", () => HttpResponse.json({ data: { items: [request], pagination: { limit: 20, offset: 0, total: 1, hasMore: false } } })),
      http.post("/api/v1/designer/assignment-requests/request-one/decision", async ({ request: req }) => {
        expect(await req.json()).toEqual({ expectedVersion: 4, decision: "decline", idempotencyKey: expect.any(String) });
        return HttpResponse.json({ error: { code: "STALE", message: "Request was cancelled." } }, { status: 409 });
      }));
    const user = userEvent.setup(); renderWithQuery(<DesignerAssignmentInbox />);
    await openInbox(user);
    const decline = await screen.findByRole("button", { name: "Decline assignment for Harbour Home" }); await waitFor(() => expect(decline).toBeEnabled()); await user.click(decline);
    expect(await screen.findByRole("alert")).toHaveTextContent("Request was cancelled."); expect(decline).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Refresh requests" })); await waitFor(() => expect(decline).toBeEnabled());
  });

  it("does not query the inbox without permission and scopes cached previews by identity", () => {
    access.canRead = false; const read = vi.fn(); server.use(http.get("/api/v1/designer/assignment-requests", read));
    renderWithQuery(<DesignerAssignmentInbox />); expect(read).not.toHaveBeenCalled(); expect(screen.queryByRole("heading", { name: "Assignment requests" })).not.toBeInTheDocument();
    expect(designerAssignmentKeys.inbox("designer-one", 0)).not.toEqual(designerAssignmentKeys.inbox("designer-two", 0));
  });

  it("refreshes a losing acceptance without opening the project or revealing the winning Designer", async () => {
    let closed = false;
    const projectRead = vi.fn();
    server.use(http.get("/api/v1/designer/assignment-requests", () => HttpResponse.json({ data: {
      items: closed ? [] : [request], pagination: { limit: 20, offset: 0, total: closed ? 0 : 1, hasMore: false }
    } })), http.get("/api/v1/projects/project-1", projectRead),
    http.post("/api/v1/designer/assignment-requests/request-one/decision", () => {
      closed = true;
      return HttpResponse.json({ error: { code: "DESIGNER_ASSIGNMENT_CONFLICT", message: "This request has closed because the project has been assigned." } }, { status: 409 });
    }));
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup(); renderWithQuery(<DesignerAssignmentInbox />);
    await openInbox(user);
    const accept = await screen.findByRole("button", { name: "Accept assignment for Harbour Home" }); await waitFor(() => expect(accept).toBeEnabled()); await user.click(accept);
    expect(await screen.findByRole("alert")).toHaveTextContent("This request has closed because the project has been assigned.");
    expect(await screen.findByText("No pending assignment requests.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Accept assignment for/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Your project is now available/)).not.toBeInTheDocument();
    expect(projectRead).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["project-workflow"] });
    await user.click(screen.getByRole("button", { name: "Refresh requests" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    invalidate.mockRestore();
  });
});

describe("Designer assignment reminder states", () => {
  it.each(["{Enter}", " "])("opens with %s, shows the total rather than page length, and restores focus on Escape", async key => {
    const read = vi.fn(() => page([request], 21)); server.use(http.get(inboxUrl, read));
    const user = userEvent.setup(); renderInbox();
    const chip = await screen.findByRole("button", { name: "Assignment requests (21)" });
    chip.focus(); await user.keyboard(key);
    expect(await screen.findByRole("dialog", { name: "Assignment requests" })).toBeVisible();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(chip).toHaveFocus());
  });

  it("does not query for another role even with the permission", () => {
    access.role = "super_admin"; const read = vi.fn(); server.use(http.get(inboxUrl, read));
    renderInbox(); expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Assignment requests/ })).not.toBeInTheDocument();
  });

  it("resets popup state when the Designer or review session changes", async () => {
    server.use(http.get(inboxUrl, () => page([{ ...request, projectName: access.id === "designer-one" ? "Harbour Home" : "Garden House" }])));
    const user = userEvent.setup(); const { rerender } = renderInbox(); await openInbox(user);
    expect(await screen.findByText("Harbour Home")).toBeVisible();
    access.id = "designer-two"; rerender(<DesignerAssignmentInbox />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(screen.queryByText("Harbour Home")).not.toBeInTheDocument();
    await openInbox(user); expect(await screen.findByText("Garden House")).toBeVisible();
    access.session = "review-new"; rerender(<DesignerAssignmentInbox />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves a failed decision retry key and uses the Account focus fallback after the final request", async () => {
    const bodies: unknown[] = []; let finished = false;
    server.use(http.get(inboxUrl, () => page(finished ? [] : [request])), http.post(decisionUrl, async ({ request: req }) => {
      bodies.push(await req.json());
      if (bodies.length === 1) return HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Please retry your response." } }, { status: 503 });
      finished = true; return HttpResponse.json({ data: { ...request, status: "declined", version: 5 } });
    }));
    const fallback = createRef<HTMLButtonElement>(); const user = userEvent.setup();
    renderInbox(<><button ref={fallback}>Account</button><DesignerAssignmentInbox fallbackFocusRef={fallback} /></>);
    await openInbox(user); const decline = screen.getByRole("button", { name: "Decline assignment for Harbour Home" });
    await waitFor(() => expect(decline).toBeEnabled()); await user.click(decline);
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry your response.");
    await user.click(decline); expect(await screen.findByText("Assignment declined.")).toBeVisible();
    expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
    expect(screen.getByRole("dialog")).toBeVisible(); expect(screen.getByText("No pending assignment requests.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Assignment requests \(/, hidden: true })).not.toBeInTheDocument();
    await user.keyboard("{Escape}"); await waitFor(() => expect(fallback.current).toHaveFocus());
  });

  it("recovers an emptied final page so remaining requests stay reachable", async () => {
    let removed = false; const offsets: number[] = [];
    server.use(http.get(inboxUrl, ({ request: req }) => {
      const offset = Number(new URL(req.url).searchParams.get("offset")); offsets.push(offset);
      return page(offset === 20 ? (removed ? [] : [{ ...request, projectName: "Last Page Home" }]) : [{ ...request, id: "first-page", projectName: "First Page Home" }], removed ? 20 : 21, offset);
    }), http.post(decisionUrl, () => { removed = true; return HttpResponse.json({ data: { ...request, status: "declined", version: 5 } }); }));
    const user = userEvent.setup(); renderInbox(); await openInbox(user);
    const next = screen.getByRole("button", { name: "Next requests" }); await waitFor(() => expect(next).toBeEnabled()); await user.click(next);
    const decline = await screen.findByRole("button", { name: "Decline assignment for Last Page Home" });
    await waitFor(() => expect(decline).toBeEnabled()); await user.click(decline);
    expect(await screen.findByText("Assignment declined.")).toBeVisible(); expect(await screen.findByText("First Page Home")).toBeVisible();
    await waitFor(() => expect(offsets.at(-1)).toBe(0));
    expect(screen.queryByRole("button", { name: "Previous requests" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assignment requests (20)", hidden: true })).toBeInTheDocument();
  });

  it("recovers a fetch failure and hides cached previews when read permission is denied", async () => {
    let failure = 503;
    server.use(http.get(inboxUrl, () => failure ? HttpResponse.json({ error: { code: "READ_FAILED", message: "Unavailable" } }, { status: failure }) : page()));
    const user = userEvent.setup(); const { client } = renderInbox();
    await user.click(await screen.findByRole("button", { name: "Assignment requests · Retry" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Assignment requests could not be refreshed.");
    failure = 0; await user.click(screen.getByRole("button", { name: "Retry requests" }));
    expect(await screen.findByText("Harbour Home")).toBeVisible();
    failure = 403; await act(async () => { await client.invalidateQueries({ queryKey: designerAssignmentKeys.all }); });
    await waitFor(() => expect(screen.queryByText("Harbour Home")).not.toBeInTheDocument()); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Assignment requests/ })).not.toBeInTheDocument();
    failure = 0; await act(async () => { await client.invalidateQueries({ queryKey: designerAssignmentKeys.all }); });
    expect(await screen.findByRole("button", { name: "Assignment requests (1)" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("blocks cached actions while refreshing and removes externally closed requests", async () => {
    let closed = false; let reads = 0; let release: () => void = () => {};
    const pause = new Promise<void>(resolve => { release = resolve; });
    server.use(http.get(inboxUrl, async () => { reads += 1; if (reads === 2) await pause; return page(closed ? [] : [request]); }));
    const user = userEvent.setup(); const { client } = renderInbox(); await openInbox(user);
    const accept = screen.getByRole("button", { name: "Accept assignment for Harbour Home" }); expect(accept).toBeDisabled();
    release(); await waitFor(() => expect(accept).toBeEnabled());
    closed = true; await act(async () => { await client.invalidateQueries({ queryKey: designerAssignmentKeys.all }); });
    expect(await screen.findByText(/Some assignment requests have closed or changed/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Accept assignment for/ })).not.toBeInTheDocument();
    expect(screen.getByText("No pending assignment requests.")).toBeVisible();
  });

  it("hides confirmed empty inboxes and keeps read-only Designers from deciding", async () => {
    let empty = true; server.use(http.get(inboxUrl, () => page(empty ? [] : [request])));
    const user = userEvent.setup(); const { client, rerender } = renderInbox();
    await waitFor(() => expect(client.getQueryData(designerAssignmentKeys.inbox("designer-one:designer:", 0))).toBeDefined());
    expect(screen.queryByRole("button", { name: /^Assignment requests/ })).not.toBeInTheDocument();
    empty = false; access.canDecide = false; rerender(<DesignerAssignmentInbox />);
    await act(async () => { await client.invalidateQueries({ queryKey: designerAssignmentKeys.all }); });
    await openInbox(user);
    expect(screen.getByRole("button", { name: "Accept assignment for Harbour Home" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline assignment for Harbour Home" })).toBeDisabled();
  });
});
