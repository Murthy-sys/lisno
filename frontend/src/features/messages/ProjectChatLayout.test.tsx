import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import { authorizationFor } from "../../test/authFixtures";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import { AppShell } from "../../components/layout/AppShell";
import { RouteFocusManager } from "../../components/layout/RouteFocusManager";
import { ProjectChatLayout } from "./ProjectChatLayout";
import { ProjectMessagesListPage } from "./ProjectMessagesListPage";
import { useChatProjectRegistration, useProjectChat } from "./ProjectChatProvider";
import { emptyChatDraft } from "./projectChatState";
import { projectChatApi } from "./projectChatApi";
import { chatTestSummary } from "./projectChatFixtures";
import type { runProjectChatStream } from "./projectChatStream";

type Stream = Parameters<typeof runProjectChatStream>[0];
const fixture = vi.hoisted(() => ({ streams: [] as Stream[], logout: vi.fn(), role: "client" as "client" | "designer" | "worker_electrician" }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({
  user: { id: "layout-user", name: "Layout Tester", email: "layout@example.test", role: fixture.role },
  authorization: authorizationFor(fixture.role, [...authorizationFor(fixture.role).permissions, "chat.read"]), status: "authenticated", logout: fixture.logout
}) }));
vi.mock("./projectChatStream", () => ({ runProjectChatStream: async (stream: Stream) => {
  fixture.streams.push(stream);
  stream.onStatus("live");
  await new Promise<void>(resolve => stream.signal.aborted ? resolve() : stream.signal.addEventListener("abort", () => resolve(), { once: true }));
} }));

function Conversation() {
  const { projectId = "" } = useParams();
  useChatProjectRegistration(projectId);
  const chat = useProjectChat();
  const draft = chat.memory[projectId]?.draft ?? emptyChatDraft();
  return <section><h1>{projectId === "project-b" ? "Garden residence" : "Courtyard residence"}</h1><label>Draft<textarea value={draft.body} onChange={event => chat.setDraft(projectId, { ...draft, body: event.target.value })} /></label><Link to="/project-messages">Back to conversations</Link></section>;
}

function app(path = "/project-messages") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={queryClient}><FeedbackProvider><MemoryRouter initialEntries={[path]}><RouteFocusManager /><Routes>
    <Route element={<AppShell />}>
      <Route element={<ProjectChatLayout />}>
        <Route path="/project-messages" element={<ProjectMessagesListPage />} />
        <Route path="/projects/:projectId/messages" element={<Conversation />} />
      </Route>
      <Route path="/home" element={<h1>Worker workspace</h1>} />
      <Route path="/client" element={<h1>Client workspace</h1>} />
      <Route path="/designer" element={<h1>Designer workspace</h1>} />
    </Route>
  </Routes></MemoryRouter></FeedbackProvider></QueryClientProvider>);
}

beforeEach(() => {
  fixture.streams = []; fixture.role = "client"; fixture.logout.mockReset();
  tokenStorage.set("layout-synthetic-session");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query === "(min-width: 1024px)", addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(projectChatApi, "summary").mockImplementation(async id => chatTestSummary({ project: { id, name: id === "project-b" ? "Garden residence" : "Courtyard residence", status: "active" } }));
  vi.spyOn(projectChatApi, "conversations").mockResolvedValue({ items: [
    { ...chatTestSummary(), lastMessageAt: "2026-09-16T08:00:00Z" },
    { ...chatTestSummary({ project: { id: "project-b", name: "Garden residence", status: "active" } }), lastMessageAt: null }
  ], pagination: { offset: 0, limit: 30, total: 2, hasMore: false } });
  vi.spyOn(projectChatApi, "messages");
});

describe("project messaging layout", () => {
  it.each(["client", "designer", "worker_electrician"] as const)("gives %s a chat shell and safe navigation without list subscriptions", async role => {
    fixture.role = role;
    app();
    const list = await screen.findByRole("complementary", { name: "Project conversations" });
    await within(list).findByRole("link", { name: /Courtyard residence/ });
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveClass("project-messaging-main");
    expect(screen.getByRole("main")).not.toHaveAttribute("data-role");
    expect(document.querySelector(".ui-app-shell, .ui-mobile-header, .ui-sidebar-rail")).toBeNull();
    expect(screen.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
    expect(projectChatApi.summary).not.toHaveBeenCalled();
    expect(projectChatApi.messages).not.toHaveBeenCalled();
    expect(fixture.streams).toHaveLength(0);
    await userEvent.click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(screen.getByRole("main")).toHaveFocus();
    const destination = { client: ["/client", "Client workspace"], designer: ["/designer", "Designer workspace"], worker_electrician: ["/home", "Worker workspace"] }[role];
    const exit = screen.getByRole("link", { name: "Back to workspace" });
    expect(exit).toHaveAttribute("href", destination[0]);
    await userEvent.click(exit);
    expect(await screen.findByRole("heading", { name: destination[1] })).toBeVisible();
    expect(screen.getByRole("main")).toHaveClass("ui-workspace");
    expect(screen.getByRole("main")).toHaveAttribute("data-role", role);
  });

  it("preserves list pagination/scroll and focuses the conversation, not the sidebar", async () => {
    vi.mocked(projectChatApi.conversations).mockImplementation(async offset => ({
      items: offset === 0 ? [{ ...chatTestSummary(), lastMessageAt: null }] : [{ ...chatTestSummary({ project: { id: "project-b", name: "Garden residence", status: "active" } }), lastMessageAt: null }],
      pagination: { offset, limit: 30, total: 31, hasMore: offset === 0 }
    }));
    app();
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    const row = await screen.findByRole("link", { name: /Garden residence/ });
    const scroller = document.querySelector<HTMLElement>(".project-messaging-list-scroll")!;
    scroller.scrollTop = 147;
    await userEvent.click(row);
    const heading = await screen.findByRole("heading", { name: "Garden residence", level: 1 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("heading", { name: "Messages", level: 2 })).toBeInTheDocument();
    expect(document.querySelector(".project-messaging-list-scroll")).toBe(scroller);
    expect(scroller.scrollTop).toBe(147);
    await userEvent.click(screen.getByRole("link", { name: "Back to conversations" }));
    expect(await screen.findByRole("heading", { name: "Messages", level: 1 })).toHaveFocus();
    expect(scroller.scrollTop).toBe(147);
    expect(projectChatApi.conversations).toHaveBeenLastCalledWith(30, expect.anything());
  });

  it("preserves project drafts with one active stream while switching projects and resizing", async () => {
    app("/projects/project-a/messages");
    await userEvent.type(screen.getByRole("textbox", { name: "Draft" }), "Keep the outlet here");
    await waitFor(() => expect(fixture.streams.filter(stream => !stream.signal.aborted)).toHaveLength(1));
    const stream = fixture.streams.at(-1)!;
    fireEvent(window, new Event("resize"));
    expect(fixture.streams.at(-1)).toBe(stream);
    const list = screen.getByRole("complementary", { name: "Project conversations" });
    await userEvent.click(await within(list).findByRole("link", { name: /Garden residence/ }));
    expect(await screen.findByRole("textbox", { name: "Draft" })).toHaveValue("");
    await waitFor(() => expect(stream.signal.aborted).toBe(true));
    await userEvent.click(within(list).getByRole("link", { name: /Courtyard residence/ }));
    expect(await screen.findByRole("textbox", { name: "Draft" })).toHaveValue("Keep the outlet here");
    await waitFor(() => expect(fixture.streams.filter(candidate => !candidate.signal.aborted)).toHaveLength(1));
  });

  it("keeps navigation focus restoration and shared topbar logout available", async () => {
    app();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await userEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(within(drawer).getByRole("navigation", { name: "Application navigation" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    const tools = screen.getByRole("banner", { name: "Workspace tools" });
    await userEvent.click(within(tools).getByRole("button", { name: "Layout Tester" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(fixture.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument());
  });
});
