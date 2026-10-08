import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, tokenStorage } from "../../api/client";
import type { ProjectStatusSummary } from "../../api/types";
import * as projectStatusApi from "../project-status/projectStatusApi";
import { projectChatApi } from "./projectChatApi";
import { chatTestSummary } from "./projectChatFixtures";
import { ProjectChatNavigation } from "./ProjectChatHeader";
import { ProjectChatProvider } from "./ProjectChatProvider";
import type { runProjectChatStream } from "./projectChatStream";
import type { ChatSummary } from "./projectChatTypes";

type StreamOptions = Parameters<typeof runProjectChatStream>[0];
const mocks = vi.hoisted(() => ({ streams: [] as StreamOptions[], chatAllowed: true }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { id: "client-a", role: "client", name: "Maya Client" }, status: "authenticated", authorization: {}
}) }));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: (_authorization: unknown, permission: string) => permission !== "chat.read" || mocks.chatAllowed }));
vi.mock("./projectChatStream", () => ({ runProjectChatStream: async (options: StreamOptions) => {
  mocks.streams.push(options);
  options.onStatus("live");
  await new Promise<void>(resolve => {
    if (options.signal.aborted) resolve();
    else options.signal.addEventListener("abort", () => resolve(), { once: true });
  });
} }));

interface NavigationOptions {
  projectId: string;
  destination: "inline" | "portal" | "pending";
  presentation: "default" | "estimate-progress";
}
function NavigationHarness({ projectId, destination, presentation }: NavigationOptions) {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  return <main>
    <h1>Estimate in progress</h1>
    <section aria-label="Header alerts" ref={setHeader} />
    <section aria-label="Project navigation">
      <ProjectChatNavigation projectId={projectId} overviewTo="/lead" overviewLabel="Lead" presentation={presentation}
        summaryContainer={destination === "inline" ? undefined : destination === "pending" ? null : header} />
    </section>
  </main>;
}
function mount(options: Partial<NavigationOptions> = {}) {
  let current: NavigationOptions = { projectId: "project-a", destination: "portal", presentation: "estimate-progress", ...options };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: Infinity } } });
  const content = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/lead"]}><ProjectChatProvider><NavigationHarness {...current} /></ProjectChatProvider></MemoryRouter></QueryClientProvider>;
  const view = render(content());
  return {
    ...view, client,
    change: (changes: Partial<NavigationOptions>) => { current = { ...current, ...changes }; view.rerender(content()); },
    refresh: () => client.refetchQueries({ predicate: query => query.queryKey.at(-1) === "summary" && query.queryKey.includes(current.projectId) })
  };
}
function statusFixture(projectId: string): ProjectStatusSummary {
  return { projectId, projectName: "Courtyard residence", projectStatus: "active", serverNow: "2026-10-08T08:00:00Z", state: "active", currentStage: { key: "estimate_review", label: "Estimate approval" }, issue: null, pendingActions: [] };
}
beforeEach(() => {
  mocks.streams = []; mocks.chatAllowed = true;
  tokenStorage.set("navigation-test-session");
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(projectStatusApi, "getProjectStatus").mockImplementation(async projectId => statusFixture(projectId));
  vi.spyOn(projectChatApi, "summary").mockImplementation(async projectId => chatTestSummary({ project: { id: projectId, name: "Courtyard residence", status: "active" } }));
});

describe("project navigation summary composition", () => {
  it("keeps the default summary inline and preserves existing navigation", async () => {
    const view = mount({ destination: "inline", presentation: "default" });
    const navigation = screen.getByRole("region", { name: "Project navigation" });
    expect(await within(navigation).findByRole("link", { name: "Critical 3" })).toHaveAttribute("href", "/projects/project-a/messages?filter=critical");
    expect(screen.getByRole("region", { name: "Header alerts" })).toBeEmptyDOMElement();
    expect(screen.getByRole("link", { name: "Lead" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute("href", "/projects/project-a/messages");
    expect(screen.getByLabelText("2 unread messages")).toBeVisible();
    expect(screen.getByLabelText("1 unread mentions")).toBeVisible();
    expect(view.container.querySelector(".project-chat-navigation--estimate-progress")).toBeNull();
  });

  it("moves the single summary into the header without duplicating the query or stream", async () => {
    mount();
    const header = screen.getByRole("region", { name: "Header alerts" });
    expect(await within(header).findByRole("link", { name: "Critical 3" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Critical 3" })).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "Project navigation" })).queryByText(/Critical/)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1));
    // The provider refreshes once when the single event stream becomes live.
    expect(projectChatApi.summary).toHaveBeenCalledTimes(2);
    const trigger = screen.getByRole("button", { name: "Project status" });
    await userEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Project status" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("waits for a supplied destination and moves back inline without duplicating summaries", async () => {
    const view = mount({ destination: "pending" });
    await waitFor(() => expect(mocks.streams).toHaveLength(1));
    expect(screen.queryByText(/Critical/)).not.toBeInTheDocument();
    view.change({ destination: "portal" });
    expect(await within(screen.getByRole("region", { name: "Header alerts" })).findByRole("link", { name: "Critical 3" })).toBeVisible();
    view.change({ destination: "inline" });
    expect(screen.getByRole("region", { name: "Header alerts" })).toBeEmptyDOMElement();
    expect(within(screen.getByRole("region", { name: "Project navigation" })).getByRole("link", { name: "Critical 3" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Critical 3" })).toHaveLength(1);
    expect(projectChatApi.summary).toHaveBeenCalledTimes(2);
    expect(mocks.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1);
  });

  it("places loading and unavailable states in the destination without inventing a count", async () => {
    let rejectSummary!: (error: Error) => void;
    vi.mocked(projectChatApi.summary).mockImplementation(() => new Promise((_resolve, reject) => { rejectSummary = reject; }));
    mount();
    const header = screen.getByRole("region", { name: "Header alerts" });
    expect(within(header).getByRole("status")).toHaveTextContent("Loading chat counts");
    expect(within(screen.getByRole("region", { name: "Project navigation" })).queryByRole("status")).not.toBeInTheDocument();
    vi.mocked(projectChatApi.summary).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { rejectSummary(new ApiError(503, "UNAVAILABLE", "Unavailable")); });
    expect(await within(header).findByText("Chat counts unavailable")).toBeVisible();
    expect(screen.queryByText(/Critical/)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Project status" })).toBeVisible();
  });

  it("keeps the server count with its stale warning together in the destination", async () => {
    const view = mount();
    await screen.findByRole("link", { name: "Critical 3" });
    vi.mocked(projectChatApi.summary).mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => { await view.refresh(); });
    const header = screen.getByRole("region", { name: "Header alerts" });
    expect(within(header).getByRole("link", { name: "Critical 3" })).toBeVisible();
    expect(await within(header).findByText("Counts may be out of date")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Critical 3" })).toHaveLength(1);
  });

  it.each(["disabled", "denied"] as const)("retains independently authorized status when chat is %s", async access => {
    if (access === "disabled") mocks.chatAllowed = false;
    else vi.mocked(projectChatApi.summary).mockRejectedValue(new ApiError(404, "NOT_FOUND", "Unavailable"));
    mount();
    await waitFor(() => expect(screen.queryByRole("link", { name: /Messages/ })).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Lead" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Header alerts" })).toBeEmptyDOMElement();
    expect(mocks.streams).toHaveLength(0);
    expect(projectChatApi.summary).toHaveBeenCalledTimes(access === "disabled" ? 0 : 1);
    const trigger = await screen.findByRole("button", { name: "Project status" });
    await userEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Project status" })).toBeVisible();
  });

  it("clears portaled private counts immediately when project access is revoked", async () => {
    mount();
    await screen.findByRole("link", { name: "Critical 3" });
    await waitFor(() => expect(mocks.streams).toHaveLength(1));
    act(() => mocks.streams[0].onDenied());
    await waitFor(() => expect(screen.getByRole("region", { name: "Header alerts" })).toBeEmptyDOMElement());
    expect(screen.queryByRole("link", { name: /Messages/ })).not.toBeInTheDocument();
    expect(mocks.streams[0].signal.aborted).toBe(true);
  });

  it("drops the prior project count while the next project loads and displays its actual zero", async () => {
    const view = mount();
    await screen.findByRole("link", { name: "Critical 3" });
    let resolveSummary!: (summary: ChatSummary) => void;
    vi.mocked(projectChatApi.summary).mockImplementation(() => new Promise(resolve => { resolveSummary = resolve; }));
    view.change({ projectId: "project-b" });
    const header = screen.getByRole("region", { name: "Header alerts" });
    expect(within(header).queryByText("Critical 3")).not.toBeInTheDocument();
    expect(within(header).getByRole("status")).toHaveTextContent("Loading chat counts");
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute("href", "/projects/project-b/messages");
    expect(screen.queryByLabelText("2 unread messages")).not.toBeInTheDocument();
    await act(async () => { resolveSummary(chatTestSummary({ project: { id: "project-b", name: "Garden residence", status: "active" }, counts: { openCritical: 0, openImportant: 1, unread: 5, unreadMentions: 0 } })); });
    expect(await within(header).findByRole("link", { name: "Critical 0" })).toHaveAttribute("href", "/projects/project-b/messages?filter=critical");
    expect(screen.getByLabelText("5 unread messages")).toBeVisible();
    await waitFor(() => expect(mocks.streams.filter(stream => !stream.signal.aborted).map(stream => stream.projectId)).toEqual(["project-b"]));
  });
});
