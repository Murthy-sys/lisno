jest.mock("expo-audio", () => ({
  AudioModule: { AudioRecorder: class {} },
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: ".m4a",
      sampleRate: 44_100,
      numberOfChannels: 2,
      bitRate: 128_000,
      android: { outputFormat: "mpeg4", audioEncoder: "aac" },
      ios: { audioQuality: 96 },
      web: { mimeType: "audio/webm", bitsPerSecond: 128_000 }
    }
  },
  createAudioPlayer: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
  setIsAudioActiveAsync: jest.fn()
}));

import { CleanupRegistry } from "../../core/config/cleanupRegistry";
import {
  AudioPermissionDeniedError,
  AudioSessionManager,
  VOICE_RECORDING_MIME_TYPE,
  VOICE_RECORDING_OPTIONS,
  type AudioAppLifecycle,
  type NativeAudioAdapter
} from "./audioSession";

class FakeLifecycle implements AudioAppLifecycle {
  private listener: ((active: boolean) => void) | null = null;

  constructor(private active = true) {}

  isActive(): boolean {
    return this.active;
  }

  subscribe(listener: (active: boolean) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  update(active: boolean): void {
    this.active = active;
    this.listener?.(active);
  }
}

function createAudioAdapter() {
  let permission = true;
  let configureRecording: () => Promise<void> = async () => undefined;
  let configurePlayback: () => Promise<void> = async () => undefined;
  const deleted: string[] = [];
  let finishPlayback: (() => void) | null = null;
  const calls = {
    configureRecording: 0,
    configurePlayback: 0,
    deactivate: 0,
    prepared: 0,
    recordedFor: [] as number[],
    stopped: 0,
    recorderReleased: 0,
    played: 0,
    paused: 0,
    playerReleased: 0
  };
  let audioMode: "inactive" | "recording" | "playback" = "inactive";
  const recorder = {
    uri: "file:///cache/voice-note.m4a" as string | null,
    currentTime: 2.5,
    async prepare() {
      calls.prepared += 1;
    },
    record(maxSeconds: number) {
      calls.recordedFor.push(maxSeconds);
    },
    async stop() {
      calls.stopped += 1;
    },
    release() {
      calls.recorderReleased += 1;
    }
  };
  const adapter: NativeAudioAdapter = {
    async requestPermission() {
      return permission;
    },
    async configureRecording() {
      calls.configureRecording += 1;
      await configureRecording();
      audioMode = "recording";
    },
    async configurePlayback() {
      calls.configurePlayback += 1;
      await configurePlayback();
      audioMode = "playback";
    },
    async deactivate() {
      calls.deactivate += 1;
      audioMode = "inactive";
    },
    createRecorder() {
      return recorder;
    },
    createPlayer() {
      return {
        play() {
          calls.played += 1;
        },
        pause() {
          calls.paused += 1;
        },
        release() {
          calls.playerReleased += 1;
        },
        onFinished(listener: () => void) {
          finishPlayback = listener;
          return () => {
            if (finishPlayback === listener) finishPlayback = null;
          };
        }
      };
    },
    async stat() {
      return { exists: true, sizeBytes: 2_048 };
    },
    async delete(uri) {
      deleted.push(uri);
    }
  };
  return {
    adapter,
    calls,
    deleted,
    recorder,
    getAudioMode: () => audioMode,
    finishPlayback: () => finishPlayback?.(),
    setConfigureRecording: (value: () => Promise<void>) => { configureRecording = value; },
    setConfigurePlayback: (value: () => Promise<void>) => { configurePlayback = value; },
    denyPermission: () => (permission = false)
  };
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

describe("native audio session", () => {
  it("uses Android MPEG-4/AAC output compatible with audio/mp4 uploads", () => {
    expect(VOICE_RECORDING_OPTIONS).toMatchObject({
      extension: ".m4a",
      directory: "cache",
      numberOfChannels: 1,
      android: {
        extension: ".m4a",
        outputFormat: "mpeg4",
        audioEncoder: "aac"
      },
      web: { mimeType: "audio/mp4" }
    });
    expect(VOICE_RECORDING_MIME_TYPE).toBe("audio/mp4");
  });

  it("requests permission only when recording is invoked and reports denial", async () => {
    const native = createAudioAdapter();
    native.denyPermission();
    const manager = new AudioSessionManager(
      new CleanupRegistry(),
      native.adapter,
      new FakeLifecycle()
    );

    await expect(manager.startRecording()).rejects.toBeInstanceOf(
      AudioPermissionDeniedError
    );
    expect(native.calls.configureRecording).toBe(0);
  });

  it("returns a bounded send-compatible private recording", async () => {
    const native = createAudioAdapter();
    const manager = new AudioSessionManager(
      new CleanupRegistry(),
      native.adapter,
      new FakeLifecycle()
    );
    const events: unknown[] = [];
    manager.subscribeRecordingEvents((event) => events.push(event));

    await manager.startRecording(45);
    await expect(manager.stopRecording()).resolves.toMatchObject({
      uri: "file:///cache/voice-note.m4a",
      mimeType: "audio/mp4",
      durationMillis: 2_500,
      sizeBytes: 2_048
    });
    expect(native.calls.recordedFor).toEqual([45]);
    expect(native.calls.recorderReleased).toBe(1);
    expect(events).toEqual([
      expect.objectContaining({ type: "completed", reason: "user" })
    ]);
  });

  it("auto-finalizes at the duration limit and keeps the asset available for staging", async () => {
    jest.useFakeTimers();
    const native = createAudioAdapter();
    const manager = new AudioSessionManager(
      new CleanupRegistry(),
      native.adapter,
      new FakeLifecycle()
    );
    const events: unknown[] = [];
    manager.subscribeRecordingEvents((event) => events.push(event));

    await manager.startRecording(1);
    await jest.advanceTimersByTimeAsync(1_000);
    await flushAsyncWork();

    expect(events).toEqual([
      expect.objectContaining({
        type: "completed",
        reason: "duration_limit",
        recording: expect.objectContaining({ uri: "file:///cache/voice-note.m4a" })
      })
    ]);
    expect(native.deleted).not.toContain("file:///cache/voice-note.m4a");

    await manager.releaseRecording("file:///cache/voice-note.m4a");
    expect(native.deleted).toContain("file:///cache/voice-note.m4a");
    jest.useRealTimers();
  });

  it("discards an interrupted recording and reports background cancellation", async () => {
    const native = createAudioAdapter();
    const lifecycle = new FakeLifecycle();
    const manager = new AudioSessionManager(
      new CleanupRegistry(),
      native.adapter,
      lifecycle
    );
    const events: unknown[] = [];
    manager.subscribeRecordingEvents((event) => events.push(event));
    await manager.startRecording();

    lifecycle.update(false);
    await flushAsyncWork();

    expect(native.deleted).toContain("file:///cache/voice-note.m4a");
    expect(events).toEqual([{ type: "interrupted", reason: "background" }]);
  });

  it("releases playback on background", async () => {
    const native = createAudioAdapter();
    const lifecycle = new FakeLifecycle();
    const manager = new AudioSessionManager(
      new CleanupRegistry(),
      native.adapter,
      lifecycle
    );
    await manager.play("file:///cache/preview.m4a", "preview-a");

    lifecycle.update(false);
    await flushAsyncWork();

    expect(native.calls.paused).toBe(1);
    expect(native.calls.playerReleased).toBe(1);
  });

  it("scopes playback controls to the owning bubble and publishes replacement and completion", async () => {
    const native = createAudioAdapter();
    const manager = new AudioSessionManager(new CleanupRegistry(), native.adapter, new FakeLifecycle());
    const events: unknown[] = [];
    manager.subscribePlaybackEvents((event) => events.push(event));

    await manager.play("file:///cache/one.m4a", "message-one");
    await manager.play("file:///cache/two.m4a", "message-two");

    expect(manager.pause("message-one")).toBe(false);
    expect(manager.stopPlayback("message-one")).toBe(false);
    expect(manager.pause("message-two")).toBe(true);
    await manager.play("file:///cache/two.m4a", "message-two");
    native.finishPlayback();

    expect(events).toEqual([
      { type: "playing", ownerId: "message-one" },
      { type: "stopped", ownerId: "message-one", reason: "replaced" },
      { type: "playing", ownerId: "message-two" },
      { type: "paused", ownerId: "message-two" },
      { type: "playing", ownerId: "message-two" },
      { type: "stopped", ownerId: "message-two", reason: "completed" }
    ]);
  });

  it("serializes overlapping playback configuration so stale deactivation cannot win", async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstConfiguration = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const secondConfiguration = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const native = createAudioAdapter();
    native.setConfigurePlayback(() => native.calls.configurePlayback === 1 ? firstConfiguration : secondConfiguration);
    const manager = new AudioSessionManager(new CleanupRegistry(), native.adapter, new FakeLifecycle());
    const events: unknown[] = [];
    manager.subscribePlaybackEvents((event) => events.push(event));

    const first = manager.play("file:///cache/one.m4a", "message-one");
    await flushAsyncWork();
    expect(native.calls.configurePlayback).toBe(1);
    const second = manager.play("file:///cache/two.m4a", "message-two");
    await flushAsyncWork();
    expect(native.calls.configurePlayback).toBe(1);

    resolveFirst();
    await first;
    await flushAsyncWork();
    expect(native.calls.configurePlayback).toBe(2);
    resolveSecond();
    await Promise.all([first, second]);

    expect(native.calls.played).toBe(1);
    expect(events).toEqual([{ type: "playing", ownerId: "message-two" }]);
    expect(native.calls.deactivate).toBe(1);
  });

  it("waits for a cancelled recording startup before configuring newer playback", async () => {
    let resolveRecordingConfiguration!: () => void;
    const recordingConfiguration = new Promise<void>((resolve) => {
      resolveRecordingConfiguration = resolve;
    });
    const native = createAudioAdapter();
    native.setConfigureRecording(() => recordingConfiguration);
    const manager = new AudioSessionManager(new CleanupRegistry(), native.adapter, new FakeLifecycle());

    const recording = manager.startRecording();
    await flushAsyncWork();
    expect(native.calls.configureRecording).toBe(1);

    const playback = manager.play("file:///cache/preview.m4a", "message-one");
    await flushAsyncWork();
    expect(native.calls.configurePlayback).toBe(0);

    resolveRecordingConfiguration();
    await expect(recording).rejects.toBeInstanceOf(Error);
    await playback;

    expect(native.calls.configurePlayback).toBe(1);
    expect(native.calls.played).toBe(1);
    expect(native.calls.deactivate).toBe(1);
    expect(native.getAudioMode()).toBe("playback");
  });

  it("removes finalized recordings during coordinated logout cleanup", async () => {
    const native = createAudioAdapter();
    const cleanups = new CleanupRegistry();
    const manager = new AudioSessionManager(
      cleanups,
      native.adapter,
      new FakeLifecycle()
    );
    await manager.startRecording();
    await manager.stopRecording();

    await cleanups.run({
      reason: "logout",
      generation: 1,
      fromEnvironment: {
        profile: "remote",
        id: "remote:https://api.example.test/api/v1",
        apiBaseUrl: "https://api.example.test/api/v1",
        origin: "https://api.example.test",
        host: "api.example.test",
        isLocal: false
      }
    });

    expect(native.deleted).toContain("file:///cache/voice-note.m4a");
  });
});
