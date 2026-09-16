import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatTestPolicy } from "./projectChatFixtures";
import { useChatRecorder } from "./useChatRecorder";

class Recorder {
  static isTypeSupported = vi.fn(() => true);
  static instances: Recorder[] = [];
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; }
}
beforeEach(() => {
  Recorder.instances = []; Recorder.isTypeSupported.mockReturnValue(true);
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function media(stop = vi.fn()) { return { getTracks: () => [{ stop }] } as unknown as MediaStream; }
function mockDevices(getUserMedia: ReturnType<typeof vi.fn>) { Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } }); }

describe("voice-note lifecycle", () => {
  it("requests a microphone only on explicit start and keeps the actual MIME without sending", async () => {
    const release = vi.fn(); const ready = vi.fn(); const get = vi.fn().mockResolvedValue(media(release)); mockDevices(get);
    const hook = renderHook(() => useChatRecorder(chatTestPolicy(), ready));
    expect(get).not.toHaveBeenCalled();
    await act(async () => hook.result.current.start());
    const recorder = Recorder.instances[0];
    act(() => recorder.ondataavailable?.({ data: new Blob(["audio"], { type: recorder.mimeType }) }));
    act(() => hook.result.current.stop());
    expect(release).toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    act(() => recorder.onstop?.());
    expect(ready).toHaveBeenCalledOnce();
    expect(ready.mock.calls[0][0]).toMatchObject({ type: "audio/webm;codecs=opus", size: 5 });
  });
  it("releases permission granted after cancellation and never constructs a recorder", async () => {
    let grant!: (stream: MediaStream) => void;
    mockDevices(vi.fn().mockReturnValue(new Promise(resolve => { grant = resolve; })));
    const release = vi.fn(); const ready = vi.fn();
    const hook = renderHook(() => useChatRecorder(chatTestPolicy(), ready));
    act(() => { void hook.result.current.start(); });
    hook.unmount();
    await act(async () => grant(media(release)));
    expect(release).toHaveBeenCalledOnce();
    expect(Recorder.instances).toHaveLength(0);
    expect(ready).not.toHaveBeenCalled();
  });
  it("does not let a cancelled recorder's late stop release a newer microphone", async () => {
    const oldRelease = vi.fn(), newRelease = vi.fn();
    mockDevices(vi.fn().mockResolvedValueOnce(media(oldRelease)).mockResolvedValueOnce(media(newRelease)));
    const ready = vi.fn(); const hook = renderHook(() => useChatRecorder(chatTestPolicy(), ready));
    await act(async () => hook.result.current.start());
    const old = Recorder.instances[0];
    act(() => hook.result.current.cancel());
    await act(async () => hook.result.current.start());
    act(() => old.onstop?.());
    expect(newRelease).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
    hook.unmount(); expect(newRelease).toHaveBeenCalledOnce();
  });
  it("stops at the policy duration and cancels on page hiding", async () => {
    vi.useFakeTimers();
    const release = vi.fn(); mockDevices(vi.fn().mockResolvedValue(media(release)));
    const policy = chatTestPolicy(); policy.limits.maxRecordingSeconds = 1;
    const hook = renderHook(() => useChatRecorder(policy, vi.fn()));
    await act(async () => hook.result.current.start());
    act(() => vi.advanceTimersByTime(1000));
    expect(Recorder.instances[0].state).toBe("inactive");
    expect(release).toHaveBeenCalled();
    act(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.state).toBe("idle");
  });
  it("keeps file selection viable when recording is unsupported or permission is denied", async () => {
    const get = vi.fn().mockRejectedValue(new Error("denied")); mockDevices(get);
    Recorder.isTypeSupported.mockReturnValue(false);
    const hook = renderHook(() => useChatRecorder(chatTestPolicy(), vi.fn()));
    await act(async () => hook.result.current.start());
    expect(get).not.toHaveBeenCalled();
    expect(hook.result.current.error).toMatch(/Attach an audio file/);
    Recorder.isTypeSupported.mockReturnValue(true);
    await act(async () => hook.result.current.start());
    await waitFor(() => expect(hook.result.current.error).toMatch(/denied or unavailable/));
    expect(hook.result.current.state).toBe("idle");
  });
  it("discards an oversized recording and releases tracks without producing a file", async () => {
    const release = vi.fn(), ready = vi.fn(); mockDevices(vi.fn().mockResolvedValue(media(release)));
    const policy = chatTestPolicy(); policy.limits.maxFileBytes = 4;
    const hook = renderHook(() => useChatRecorder(policy, ready));
    await act(async () => hook.result.current.start());
    act(() => Recorder.instances[0].ondataavailable?.({ data: new Blob(["oversized"]) }));
    act(() => Recorder.instances[0].onstop?.());
    expect(ready).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(hook.result.current.error).toMatch(/file-size limit/);
  });
});
