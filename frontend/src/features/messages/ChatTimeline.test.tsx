import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { projectChatApi } from "./projectChatApi";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatTimeline } from "./ChatTimeline";
import { ChatMediaProvider } from "./ChatMessageAttachments";
import { chatTestMessage, chatTestPeople } from "./projectChatFixtures";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "client" } }) }));
const access = { enabled: true, denied: new Set<string>(), userId: "client-a", scope: "session-a", isCurrent: () => () => true, verifyAccess: vi.fn() };
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => access }));
const first = chatTestMessage({ author: chatTestPeople[1] });
const second = chatTestMessage({ id: "message-b", sequence: 7, body: "Another update", author: chatTestPeople[1], createdAt: "2026-09-16T08:01:00Z" });
const props = () => ({ projectId: "project-a", messages: [first], attempts: [], lastRead: 3, hasOlder: false, hasNewer: false, filtered: false, latestSequence: 3, loadingOlder: false, loadingNewer: false, canSend: true, onOlder: vi.fn(), onNewer: vi.fn(), onLatest: vi.fn(), onReply: vi.fn(), onContext: vi.fn(), onIssue: vi.fn(), onRetry: vi.fn(), onEditAttempt: vi.fn() });
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={new QueryClient()}><MemoryRouter><ChatMediaProvider projectId="project-a">{children}</ChatMediaProvider></MemoryRouter></QueryClientProvider>; }
beforeEach(() => { vi.clearAllMocks(); });

describe("chat transcript presentation", () => {
  it("identifies a service author without assigning a human role or exposing issue controls", async () => {
    const input = props();
    render(<ChatTimeline {...input} messages={[chatTestMessage({ author: { kind: "service", id: "lisno-ai", name: "Lisno AI" }, body: "I checked the current project status." })]} />, { wrapper });
    expect(screen.getByRole("article", { name: "Message from Lisno AI" })).toBeInTheDocument();
    expect(screen.getByText("AI assistant")).toBeInTheDocument();
    const mark = screen.getByRole("article", { name: "Message from Lisno AI" }).querySelector("img.lisno-chat-mark")!;
    expect(mark).toHaveAttribute("src", "/lisno-chat-mark.svg");
    expect(mark).toHaveAttribute("alt", "");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("width", "24");
    expect(mark).toHaveAttribute("height", "24");
    fireEvent.error(mark);
    expect(screen.getByText("Lisno AI")).toBeVisible();
    expect(screen.getByText("AI assistant")).toBeVisible();
    expect(screen.getByText("I checked the current project status.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Message options from Lisno AI" }));
    expect(screen.getByRole("menuitem", { name: "Reply" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Flag importance" })).not.toBeInTheDocument();
  });
  it("does not brand a human sender named Lisno AI even if its ID matches the service", () => {
    render(<ChatTimeline {...props()} messages={[chatTestMessage({ author: { kind: "human", id: "lisno-ai", name: "Lisno AI", role: "client" } })]} />, { wrapper });
    const message = screen.getByRole("article", { name: "Message from Lisno AI" });
    expect(message.querySelector(".lisno-chat-mark")).toBeNull();
    expect(screen.queryByText("AI assistant")).not.toBeInTheDocument();
    expect(message).not.toHaveClass("project-chat-message--assistant");
  });
  it("keeps one logo per grouped AI sender heading and preserves each message time and menu", () => {
    const author = { kind: "service" as const, id: "lisno-ai" as const, name: "Lisno AI" as const };
    render(<ChatTimeline {...props()} lastRead={4} messages={[chatTestMessage({ author }), chatTestMessage({ id: "ai-followup", sequence: 4, author, createdAt: "2026-09-16T08:01:00Z" })]} />, { wrapper });
    const messages = screen.getAllByRole("article", { name: "Message from Lisno AI" });
    expect(messages).toHaveLength(2);
    expect(messages[0].querySelector(".lisno-chat-mark")).not.toBeNull();
    expect(messages[1]).toHaveClass("project-chat-message--grouped");
    expect(messages[1].querySelector(".lisno-chat-mark")).toBeNull();
    expect(document.querySelectorAll(".project-chat-message__time time")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Message options from Lisno AI" })).toHaveLength(2);
  });
  it("shows the authenticated AI answer once instead of the generic shared body", async () => {
    vi.spyOn(projectChatApi, "assistantResult").mockResolvedValue({ id: "answer-a", projectId: "project-a", messageId: "ai-message", kind: "status", checkedAt: "2026-10-09T08:00:00Z", stale: false, commercialAccess: "none", facts: [], candidates: [], missingInputs: [], commercial: null, narrative: [{ text: "Your project team is preparing the next stage.", factIds: [] }] });
    render(<ChatTimeline {...props()} messages={[chatTestMessage({ author: { kind: "service", id: "lisno-ai", name: "Lisno AI" }, body: "I checked the current project status.", assistant: { runId: "run-a", generation: 1, status: "answered", eligibleAt: "2026-10-09T08:00:00Z", resultId: "answer-a", checkedAt: "2026-10-09T08:00:00Z", routing: "not_required", notified: null, canRequest: false, failureCode: null } })]} />, { wrapper });
    expect(await screen.findByText("Your project team is preparing the next stage.")).toBeVisible();
    expect(screen.queryByText("I checked the current project status.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Lisno AI answer" })).toHaveLength(1);
    expect(document.querySelectorAll(".project-chat-message__time time")).toHaveLength(1);
  });
  it("keeps refresh inside the original message menu without a Client routing footer", async () => {
    render(<ChatTimeline {...props()} messages={[chatTestMessage({ assistant: { runId: "run-a", generation: 1, status: "answered", eligibleAt: "2026-10-09T08:00:00Z", resultId: "answer-a", checkedAt: "2026-10-09T08:00:00Z", routing: "notified", notified: chatTestPeople[1], canRequest: true, failureCode: null } })]} />, { wrapper });
    expect(screen.queryByText(/Alert sent|Recalculate/)).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Refresh AI reply" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Message options from Maya Client" }));
    expect(screen.getByRole("menuitem", { name: "Refresh AI reply" })).toBeVisible();
  });
  it("keeps a reader's scroll position on arrival and jumps only on request", async () => {
    const input = props();
    const view = render(<ChatTimeline {...input} />, { wrapper });
    const scroll = screen.getByRole("region", { name: "Project conversation" });
    Object.defineProperties(scroll, { scrollHeight: { configurable: true, value: 1200 }, clientHeight: { configurable: true, value: 200 } });
    fireEvent(window, new Event("resize"));
    scroll.scrollTop = 100;
    fireEvent.scroll(scroll);
    view.rerender(<ChatTimeline {...input} messages={[first, second]} latestSequence={7} />);
    expect(scroll.scrollTop).toBe(100);
    await userEvent.click(screen.getByRole("button", { name: "New messages · Go to latest" }));
    expect(scroll.scrollTop).toBe(1200);
  });
  it("preserves the visible message anchor when earlier history is prepended", async () => {
    const input = { ...props(), hasOlder: true };
    const view = render(<ChatTimeline {...input} />, { wrapper });
    const scroll = screen.getByRole("region", { name: "Project conversation" });
    const article = screen.getByRole("article", { name: "Message from Alex Team" });
    let top = 120;
    vi.spyOn(scroll, "getBoundingClientRect").mockImplementation(() => ({ top: 100, bottom: 300 }) as DOMRect);
    vi.spyOn(article, "getBoundingClientRect").mockImplementation(() => ({ top, bottom: top + 80 }) as DOMRect);
    scroll.scrollTop = 100;
    await userEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(input.onOlder).toHaveBeenCalledOnce();
    top = 520;
    view.rerender(<ChatTimeline {...input} messages={[chatTestMessage({ id: "older", sequence: 1, body: "Earlier history" }), first]} />);
    expect(scroll.scrollTop).toBe(500);
    expect(screen.getByRole("article", { name: "Message from Alex Team" })).toBe(article);
  });
  it("keeps every grouped message accessible and exposes reply by keyboard", async () => {
    const input = props();
    render(<ChatTimeline {...input} messages={[first, second]} latestSequence={7} />, { wrapper });
    expect(screen.getAllByRole("article", { name: "Message from Alex Team" })).toHaveLength(2);
    const trigger = screen.getAllByRole("button", { name: "Message options from Alex Team" })[1];
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Reply" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}{Enter}");
    expect(input.onReply).toHaveBeenCalledWith(second);
  });
  it("follows the bottom through resize, then anchors the visible message while reading older history", () => {
    const original = globalThis.ResizeObserver;
    let resize!: ResizeObserverCallback;
    const disconnect = vi.fn();
    globalThis.ResizeObserver = class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect = disconnect; } as unknown as typeof ResizeObserver;
    try {
      const view = render(<ChatTimeline {...props()} />, { wrapper });
      const scroll = screen.getByRole("region", { name: "Project conversation" });
      const article = screen.getByRole("article", { name: "Message from Alex Team" });
      let width = 900, height = 600, scrollHeight = 1200, top = 120;
      Object.defineProperties(scroll, { clientWidth: { configurable: true, get: () => width }, clientHeight: { configurable: true, get: () => height }, scrollHeight: { configurable: true, get: () => scrollHeight } });
      vi.spyOn(scroll, "getBoundingClientRect").mockImplementation(() => ({ top: 100, bottom: 100 + height }) as DOMRect);
      vi.spyOn(article, "getBoundingClientRect").mockImplementation(() => ({ top, bottom: top + 80 }) as DOMRect);
      act(() => resize([], {} as ResizeObserver));
      expect(scroll.scrollTop).toBe(1200);
      width = 390; height = 300; scrollHeight = 2200;
      // Browsers may emit a geometry-induced scroll before delivering ResizeObserver.
      fireEvent.scroll(scroll);
      act(() => resize([], {} as ResizeObserver));
      expect(scroll.scrollTop).toBe(2200);
      scroll.scrollTop = 100; fireEvent.scroll(scroll);
      width = 320; height = 200; top = 420;
      fireEvent.scroll(scroll);
      act(() => resize([], {} as ResizeObserver));
      expect(scroll.scrollTop).toBe(400);
      view.unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally { globalThis.ResizeObserver = original; }
  });
  it("does not move a filtered or quote-context view to the bottom on its first resize", () => {
    const input = { ...props(), filtered: true, around: first.id };
    render(<ChatTimeline {...input} />, { wrapper });
    const scroll = screen.getByRole("region", { name: "Filtered project messages" });
    Object.defineProperties(scroll, { clientWidth: { configurable: true, value: 360 }, clientHeight: { configurable: true, value: 250 }, scrollHeight: { configurable: true, value: 1800 } });
    scroll.scrollTop = 123;
    fireEvent(window, new Event("resize"));
    expect(scroll.scrollTop).toBe(123);
  });
  it("renders one timestamp for multiple audio rows and keeps caption time outside the player", () => {
    const attachment = { id: "audio-one", kind: "audio" as const, filename: "voice.webm", mimeType: "audio/webm", byteSize: 1024, preview: null };
    const message = chatTestMessage({ body: "", attachments: [attachment, { ...attachment, id: "audio-two", filename: "second.webm" }] });
    const view = render(<ChatTimeline {...props()} messages={[message]} />, { wrapper });
    expect(screen.getAllByRole("group", { name: /^Audio:/ })).toHaveLength(2);
    expect(document.querySelectorAll("time")).toHaveLength(1);
    expect(document.querySelector("time")?.closest(".project-chat-audio")).not.toBeNull();
    view.rerender(<ChatTimeline {...props()} messages={[{ ...message, body: "Please review this recording" }]} />);
    expect(document.querySelectorAll("time")).toHaveLength(1);
    expect(document.querySelector("time")?.closest(".project-chat-message__body")).not.toBeNull();
  });
  it("shows an audio-send failure once while keeping retry, edit and discard", () => {
    const error = "The file contents do not match a supported format.";
    render(<ChatTimeline {...props()} messages={[]} onDiscard={vi.fn()} attempts={[{ input: { clientMessageId: "failed-audio", body: "", mentions: [], priority: "normal", replyToId: null, responsibleUserId: null }, status: "failed", error, files: [{ localId: "local", clientUploadId: "upload", kind: "audio", file: new File(["audio"], "voice.webm"), progress: 100, error }] }]} />, { wrapper });
    expect(screen.getAllByText(error)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit message" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
  });
});
