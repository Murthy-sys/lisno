import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAudioController, CHAT_AUDIO_BUDGET, type ChatAudioSource } from "./chatAudioController";

const players: FakeAudio[] = [];
class FakeAudio extends EventTarget {
  src = ""; preload = ""; muted = false; paused = true; duration = NaN; currentTime = 0; readyState = 0;
  play = vi.fn(() => { this.paused = false; this.dispatchEvent(new Event("playing")); return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event("pause")); });
  load = vi.fn(); removeAttribute = vi.fn();
  constructor() { super(); players.push(this); }
  metadata(duration: number) { this.duration = duration; this.readyState = 1; this.dispatchEvent(new Event("loadedmetadata")); }
}
const local = (key = "draft"): ChatAudioSource => ({ key, filename: `${key}.webm`, file: new File(["audio"], `${key}.webm`, { type: "audio/webm" }) });
const sent = (key = "sent"): ChatAudioSource => ({ key, filename: `${key}.webm`, attachment: { id: key, filename: `${key}.webm`, kind: "audio", mimeType: "audio/webm", byteSize: 5, preview: null } });
function fixture() {
  let current = true;
  const load = vi.fn(async () => new Blob(["audio"]));
  const beforeStart = vi.fn();
  const controller = new ChatAudioController({ load, beforeStart, current: () => () => current, errorMessage: () => "Audio is unavailable." });
  return { controller, load, beforeStart, invalidate: () => { current = false; } };
}
beforeEach(() => {
  players.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:audio-${players.length}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("chat audio ownership", () => {
  it("waits for explicit play, discovers actual duration, pauses, seeks, ends and replays", async () => {
    const { controller, load } = fixture();
    expect(load).not.toHaveBeenCalled();
    controller.toggle(local());
    expect(controller.getSnapshot().duration).toBeUndefined();
    expect(players[0].play).not.toHaveBeenCalled();
    players[0].metadata(12.4);
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", duration: 12.4 });
    controller.toggle(local());
    expect(controller.getSnapshot().status).toBe("paused");
    controller.seek("draft", 7);
    expect(players[0].currentTime).toBe(7);
    controller.seek("draft", 100);
    expect(players[0].currentTime).toBe(12.4);
    players[0].dispatchEvent(new Event("ended"));
    controller.toggle(local());
    await Promise.resolve();
    expect(players[0].currentTime).toBe(0);
    expect(controller.getSnapshot().status).toBe("playing");
    controller.release();
  });
  it("discovers Infinity metadata while muted and paused, then resets before playback", async () => {
    const { controller } = fixture();
    controller.toggle(local()); players[0].metadata(Infinity);
    expect(players[0].currentTime).toBe(CHAT_AUDIO_BUDGET.durationProbeSeconds);
    expect(players[0].muted).toBe(true);
    expect(players[0].play).not.toHaveBeenCalled();
    players[0].duration = 2.8; players[0].dispatchEvent(new Event("seeked"));
    await Promise.resolve();
    expect(players[0].currentTime).toBe(0);
    expect(players[0].muted).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ duration: 2.8, status: "playing" });
    controller.release();
  });
  it("keeps an unknown-duration fallback when end probing cannot establish duration", async () => {
    vi.useFakeTimers();
    const { controller } = fixture();
    controller.toggle(local()); players[0].metadata(Infinity);
    await vi.advanceTimersByTimeAsync(CHAT_AUDIO_BUDGET.durationProbeTimeoutMs);
    expect(controller.getSnapshot()).toMatchObject({ status: "playing", currentTime: 0 });
    expect(controller.getSnapshot().duration).toBeUndefined();
    expect(players[0].muted).toBe(false);
    controller.seek("draft", 20); expect(players[0].currentTime).toBe(0);
    controller.release(); expect(vi.getTimerCount()).toBe(0);
  });
  it("pauses and releases a local original before loading a sent clip, then ignores stale fetch completion", async () => {
    const { controller, load } = fixture();
    controller.toggle(local()); players[0].metadata(3); await Promise.resolve();
    let resolve!: (blob: Blob) => void;
    load.mockImplementation(() => new Promise(done => { resolve = done; }));
    controller.toggle(sent());
    expect(players[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-0");
    const signal = (load.mock.calls[0] as unknown as [unknown, AbortSignal])[1];
    controller.toggle(local("other"));
    expect(signal.aborted).toBe(true);
    resolve(new Blob(["stale"])); await Promise.resolve();
    expect(players).toHaveLength(2);
    expect(controller.getSnapshot().key).toBe("other");
    controller.release();
  });
  it("drops a completion from a revoked session before creating any URL", async () => {
    const { controller, load, invalidate } = fixture();
    let resolve!: (blob: Blob) => void;
    load.mockImplementation(() => new Promise(done => { resolve = done; }));
    controller.toggle(sent()); invalidate(); resolve(new Blob(["private"]));
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    controller.release();
  });
  it("keeps download available after a rejected play promise and retries explicitly", async () => {
    const { controller } = fixture();
    const save = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    controller.toggle(local()); players[0].play.mockRejectedValueOnce(new Error("unsupported")); players[0].metadata(5);
    await Promise.resolve(); await Promise.resolve();
    expect(controller.getSnapshot().status).toBe("error");
    controller.download(local()); expect(save).toHaveBeenCalledOnce();
    controller.toggle(local()); expect(players).toHaveLength(1);
    expect(players[0].play).toHaveBeenCalledTimes(2); await Promise.resolve();
    expect(controller.getSnapshot().status).toBe("playing");
    controller.release(); save.mockRestore();
  });
  it("uses one bounded live analyser, real amplitudes only, and closes it on owner change", async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn(), close = vi.fn(async () => undefined);
    const getFloatTimeDomainData = vi.fn((samples: Float32Array) => samples.fill(0.25));
    const contexts = vi.fn(function () { return { state: "running", createAnalyser: () => ({ fftSize: 0, connect: vi.fn(), disconnect, getFloatTimeDomainData }), createMediaElementSource: () => ({ connect: vi.fn(), disconnect }), destination: {}, close, resume: async () => undefined }; });
    vi.stubGlobal("AudioContext", contexts);
    const { controller } = fixture();
    controller.toggle(local()); players[0].metadata(10); await Promise.resolve();
    players[0].currentTime = 2;
    await vi.advanceTimersByTimeAsync(200);
    const peaks = controller.getSnapshot().peaks;
    expect(contexts).toHaveBeenCalledOnce(); expect(getFloatTimeDomainData).toHaveBeenCalledOnce();
    expect(peaks.filter(value => value !== null)).toEqual([0.25]);
    expect(peaks).toHaveLength(CHAT_AUDIO_BUDGET.bins);
    controller.toggle(local("next"));
    expect(close).toHaveBeenCalledOnce(); expect(disconnect).toHaveBeenCalledTimes(2);
    controller.release(); expect(vi.getTimerCount()).toBe(0);
  });
  it("skips analysis of oversized, overlong and unknown-duration media", async () => {
    const context = vi.fn(); vi.stubGlobal("AudioContext", context);
    const { controller } = fixture();
    controller.toggle(local()); players[0].metadata(301); await Promise.resolve();
    controller.toggle({ key: "big", filename: "big.wav", file: new File([new Uint8Array(CHAT_AUDIO_BUDGET.maxAnalysisBytes + 1)], "big.wav") });
    players[1].metadata(1); await Promise.resolve();
    controller.toggle(local("unknown")); players[2].metadata(NaN); await Promise.resolve();
    expect(context).not.toHaveBeenCalled();
    expect(controller.getSnapshot().peaks).toEqual([]); controller.release();
  });
  it("leaves native playback un-routed when analysis resume is blocked or outlives its owner", async () => {
    vi.useFakeTimers();
    const createMediaElementSource = vi.fn(), close = vi.fn(async () => undefined);
    let resume!: () => void;
    vi.stubGlobal("AudioContext", vi.fn(function () { return { state: "suspended", createMediaElementSource, close, resume: () => new Promise<void>(done => { resume = done; }) }; }));
    const { controller } = fixture();
    controller.toggle(local()); players[0].metadata(10); await Promise.resolve();
    expect(controller.getSnapshot().status).toBe("playing");
    await vi.advanceTimersByTimeAsync(CHAT_AUDIO_BUDGET.analysisStartTimeoutMs);
    expect(createMediaElementSource).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
    resume(); await Promise.resolve();
    expect(createMediaElementSource).not.toHaveBeenCalled(); expect(players[0].paused).toBe(false);
    controller.release(); expect(vi.getTimerCount()).toBe(0);
  });
});
