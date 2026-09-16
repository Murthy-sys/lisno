import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStorage } from "../../api/client";
import { projectChatApi } from "./projectChatApi";
import { useChatTypingActivity } from "./useChatTypingActivity";

beforeEach(() => {
  vi.useFakeTimers();
  tokenStorage.set("synthetic-typing-session");
  vi.spyOn(projectChatApi, "typing").mockImplementation(async (_project, input) => ({ sequence: input.sequence, typing: input.typing, expiresAt: input.typing ? new Date(Date.now() + 8000).toISOString() : null }));
});
afterEach(() => vi.useRealTimers());

describe("typing publisher lifecycle", () => {
  it("stops on tab hiding and waits for a new edit after visibility returns", async () => {
    const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const view = renderHook(() => useChatTypingActivity("project-a", true));
    act(() => view.result.current.edit("Typing"));
    expect(projectChatApi.typing).toHaveBeenCalledTimes(1);
    visible.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => view.result.current.edit("Hidden input"));
    expect(vi.mocked(projectChatApi.typing).mock.calls.map(call => call[1].typing)).toEqual([true, false]);
    visible.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(projectChatApi.typing).toHaveBeenCalledTimes(2);
    act(() => view.result.current.edit("Back to editing"));
    expect(vi.mocked(projectChatApi.typing).mock.calls.at(-1)![1].typing).toBe(true);
    view.unmount();
  });
  it("stops the previous project and ignores edits while offline without restoring old activity", async () => {
    const view = renderHook(({ project, live }) => useChatTypingActivity(project, live), { initialProps: { project: "project-a", live: true } });
    act(() => view.result.current.edit("Project A"));
    view.rerender({ project: "project-b", live: true });
    expect(vi.mocked(projectChatApi.typing).mock.calls.map(call => [call[0], call[1].typing])).toEqual([["project-a", true], ["project-a", false]]);
    act(() => view.result.current.edit("Project B"));
    view.rerender({ project: "project-b", live: false });
    act(() => view.result.current.edit("Offline edit"));
    view.rerender({ project: "project-b", live: true });
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(vi.mocked(projectChatApi.typing).mock.calls.map(call => [call[0], call[1].typing])).toEqual([["project-a", true], ["project-a", false], ["project-b", true], ["project-b", false]]);
    view.unmount();
  });
  it("never sends the old composer's activity under a replacement account token", async () => {
    const view = renderHook(() => useChatTypingActivity("project-a", true));
    act(() => view.result.current.edit("Old account"));
    tokenStorage.set("synthetic-replacement-session");
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(projectChatApi.typing).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
