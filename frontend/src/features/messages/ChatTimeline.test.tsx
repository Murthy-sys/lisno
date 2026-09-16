import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatTimeline } from "./ChatTimeline";
import { chatTestMessage, chatTestPeople } from "./projectChatFixtures";

const access = { userId: "client-a", scope: "session-a", isCurrent: () => () => true, verifyAccess: vi.fn() };
vi.mock("./ProjectChatProvider", () => ({ useProjectChat: () => access }));
const first = chatTestMessage({ author: chatTestPeople[1] });
const second = chatTestMessage({ id: "message-b", sequence: 7, body: "Another update", author: chatTestPeople[1], createdAt: "2026-09-16T08:01:00Z" });
const props = () => ({ projectId: "project-a", messages: [first], attempts: [], lastRead: 3, hasOlder: false, hasNewer: false, filtered: false, latestSequence: 3, loadingOlder: false, loadingNewer: false, canSend: true, onOlder: vi.fn(), onNewer: vi.fn(), onLatest: vi.fn(), onReply: vi.fn(), onContext: vi.fn(), onIssue: vi.fn(), onRetry: vi.fn(), onEditAttempt: vi.fn() });
function wrapper({ children }: { children: React.ReactNode }) { return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>; }
beforeEach(() => { vi.clearAllMocks(); });

describe("chat transcript presentation", () => {
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
});
