import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type RecordingOptions
} from "expo-audio";
import { File } from "expo-file-system";
import { AppState } from "react-native";

import type { CleanupRegistry } from "../../core/config/cleanupRegistry";

export const VOICE_RECORDING_MIME_TYPE = "audio/mp4" as const;
export const VOICE_RECORDING_EXTENSION = ".m4a" as const;
export const DEFAULT_MAX_RECORDING_SECONDS = 5 * 60;

export const VOICE_RECORDING_OPTIONS: RecordingOptions = Object.freeze({
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache",
  extension: VOICE_RECORDING_EXTENSION,
  numberOfChannels: 1,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: VOICE_RECORDING_EXTENSION,
    outputFormat: "mpeg4" as const,
    audioEncoder: "aac" as const
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: VOICE_RECORDING_EXTENSION
  },
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    mimeType: VOICE_RECORDING_MIME_TYPE
  }
});

export interface RecordedAudio {
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: typeof VOICE_RECORDING_MIME_TYPE;
  readonly durationMillis: number;
  readonly sizeBytes: number;
}

export type AudioRecordingCompletionReason = "user" | "duration_limit";
export type AudioRecordingInterruptionReason =
  | "background"
  | "cancelled"
  | "cleanup"
  | "replaced";

export type AudioRecordingLifecycleEvent =
  | {
      readonly type: "completed";
      readonly reason: AudioRecordingCompletionReason;
      readonly recording: RecordedAudio;
    }
  | {
      readonly type: "interrupted";
      readonly reason: AudioRecordingInterruptionReason;
    }
  | {
      readonly type: "failed";
      readonly error: Error;
    };

interface RecorderPort {
  readonly uri: string | null;
  readonly currentTime: number;
  prepare(): Promise<void>;
  record(maxSeconds: number): void;
  stop(): Promise<void>;
  release(): void;
}

interface PlayerPort {
  play(): void;
  pause(): void;
  release(): void;
  onFinished(listener: () => void): () => void;
}

export type AudioPlaybackStopReason = "background" | "cleanup" | "completed" | "recording" | "replaced";

export type AudioPlaybackLifecycleEvent =
  | { readonly type: "playing"; readonly ownerId: string }
  | { readonly type: "paused"; readonly ownerId: string }
  | { readonly type: "stopped"; readonly ownerId: string; readonly reason: AudioPlaybackStopReason };

export interface NativeAudioAdapter {
  requestPermission(): Promise<boolean>;
  configureRecording(): Promise<void>;
  configurePlayback(): Promise<void>;
  deactivate(): Promise<void>;
  createRecorder(): RecorderPort;
  createPlayer(uri: string): PlayerPort;
  stat(uri: string): Promise<{ readonly exists: boolean; readonly sizeBytes: number }>;
  delete(uri: string): Promise<void>;
}

export interface AudioAppLifecycle {
  isActive(): boolean;
  subscribe(listener: (active: boolean) => void): () => void;
}

function createNativeAudioAdapter(): NativeAudioAdapter {
  return {
    async requestPermission() {
      return (await requestRecordingPermissionsAsync()).granted;
    },
    async configureRecording() {
      await setIsAudioActiveAsync(true);
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix"
      });
    },
    async configurePlayback() {
      await setIsAudioActiveAsync(true);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: "doNotMix"
      });
    },
    async deactivate() {
      await setIsAudioActiveAsync(false);
    },
    createRecorder() {
      const recorder = new AudioModule.AudioRecorder(VOICE_RECORDING_OPTIONS);
      return {
        get uri() {
          return recorder.uri;
        },
        get currentTime() {
          return recorder.currentTime;
        },
        prepare: () => recorder.prepareToRecordAsync(),
        record: (maxSeconds) => recorder.record({ forDuration: maxSeconds }),
        stop: () => recorder.stop(),
        release: () => recorder.release()
      };
    },
    createPlayer(uri) {
      const player = createAudioPlayer({ uri }, { updateInterval: 250 });
      return {
        play: () => player.play(),
        pause: () => player.pause(),
        release: () => player.release(),
        onFinished(listener) {
          const subscription = player.addListener("playbackStatusUpdate", (status) => {
            if (status.didJustFinish) listener();
          });
          return () => subscription.remove();
        }
      };
    },
    async stat(uri) {
      const file = new File(uri);
      return { exists: file.exists, sizeBytes: file.size ?? 0 };
    },
    async delete(uri) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
  };
}

function createNativeAppLifecycle(): AudioAppLifecycle {
  return {
    isActive: () => AppState.currentState === "active",
    subscribe(listener) {
      const subscription = AppState.addEventListener("change", (state) =>
        listener(state === "active")
      );
      return () => subscription.remove();
    }
  };
}

export class AudioPermissionDeniedError extends Error {
  readonly code = "AUDIO_PERMISSION_DENIED";

  constructor() {
    super("Microphone permission is required to record a voice note.");
    this.name = "AudioPermissionDeniedError";
  }
}

export class AudioRecordingInterruptedError extends Error {
  readonly code = "AUDIO_RECORDING_INTERRUPTED";

  constructor() {
    super("The audio operation was interrupted.");
    this.name = "AudioRecordingInterruptedError";
  }
}

export class AudioSessionManager {
  private recorder: RecorderPort | null = null;
  private recordingStartup: Promise<void> | null = null;
  private recordingFinalization: Promise<RecordedAudio> | null = null;
  private playback: { readonly ownerId: string; readonly player: PlayerPort; readonly unsubscribeFinished: () => void; playing: boolean } | null = null;
  private recordingTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly recordings = new Set<string>();
  private readonly recordingListeners = new Set<
    (event: AudioRecordingLifecycleEvent) => void
  >();
  private readonly playbackListeners = new Set<
    (event: AudioPlaybackLifecycleEvent) => void
  >();
  private operationGeneration = 0;
  private playbackGeneration = 0;
  private pendingPlaybackOwner: string | null = null;
  private playbackTransition: Promise<void> = Promise.resolve();
  private readonly unsubscribeLifecycle: () => void;
  private readonly unregisterCleanup: () => void;

  constructor(
    cleanups: CleanupRegistry,
    private readonly native: NativeAudioAdapter = createNativeAudioAdapter(),
    private readonly lifecycle: AudioAppLifecycle = createNativeAppLifecycle()
  ) {
    this.unsubscribeLifecycle = this.lifecycle.subscribe((active) => {
      if (!active) void this.interrupt("background");
    });
    this.unregisterCleanup = cleanups.register(
      "native-audio",
      () => this.cleanup(),
      14
    );
  }

  subscribeRecordingEvents(
    listener: (event: AudioRecordingLifecycleEvent) => void
  ): () => void {
    this.recordingListeners.add(listener);
    return () => this.recordingListeners.delete(listener);
  }

  subscribePlaybackEvents(
    listener: (event: AudioPlaybackLifecycleEvent) => void
  ): () => void {
    this.playbackListeners.add(listener);
    return () => this.playbackListeners.delete(listener);
  }

  async startRecording(
    maxSeconds = DEFAULT_MAX_RECORDING_SECONDS
  ): Promise<void> {
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
      throw new Error("The recording duration limit must be positive.");
    }
    if (!this.lifecycle.isActive()) {
      throw new Error("Voice recording is available only while Lisno is active.");
    }
    await this.cancelRecording("replaced");
    this.stopPlayback(undefined, "recording");
    await this.playbackTransition.catch(() => undefined);
    const generation = ++this.operationGeneration;
    const startup = this.beginRecording(maxSeconds, generation);
    this.recordingStartup = startup;
    try {
      await startup;
    } finally {
      if (this.recordingStartup === startup) this.recordingStartup = null;
    }
  }

  private async beginRecording(maxSeconds: number, generation: number): Promise<void> {
    if (!(await this.native.requestPermission())) {
      throw new AudioPermissionDeniedError();
    }
    this.assertActiveGeneration(generation);
    await this.native.configureRecording();
    try {
      this.assertActiveGeneration(generation);
    } catch (error) {
      await this.native.deactivate().catch(() => undefined);
      throw error;
    }
    const recorder = this.native.createRecorder();
    this.recorder = recorder;
    try {
      await recorder.prepare();
      this.assertActiveGeneration(generation);
      if (this.recorder !== recorder) {
        throw new Error("The recording operation was interrupted.");
      }
      recorder.record(maxSeconds);
      this.recordingTimer = setTimeout(() => {
        void this.finalizeRecording("duration_limit").catch(() => undefined);
      }, maxSeconds * 1_000);
    } catch (error) {
      if (this.recorder === recorder) {
        this.recorder = null;
        recorder.release();
        await this.native.deactivate().catch(() => undefined);
      }
      throw error;
    }
  }

  async stopRecording(): Promise<RecordedAudio> {
    return this.finalizeRecording("user");
  }

  async cancelRecording(
    reason: AudioRecordingInterruptionReason = "cancelled"
  ): Promise<void> {
    this.operationGeneration += 1;
    const startup = this.recordingStartup;
    const recorder = this.recorder;
    const finalization = this.recordingFinalization;
    const hadActiveRecording = startup !== null || recorder !== null || finalization !== null;
    this.recorder = null;
    this.clearRecordingTimer();
    if (recorder) {
      let uri = recorder.uri;
      try {
        await recorder.stop();
        uri = recorder.uri ?? uri;
      } catch {
        // Release and delete any partial output after an interrupted recording.
      } finally {
        recorder.release();
        await this.native.deactivate().catch(() => undefined);
      }
      if (uri) await this.native.delete(uri).catch(() => undefined);
    }
    if (startup) await startup.catch(() => undefined);
    if (finalization) await finalization.catch(() => undefined);
    if (hadActiveRecording) this.emitRecordingEvent({ type: "interrupted", reason });
  }

  async play(uri: string, ownerId: string): Promise<void> {
    if (!/^(?:file|content):\/\//u.test(uri)) {
      throw new Error("Only local authenticated audio can be played.");
    }
    if (!ownerId.trim()) throw new Error("Audio playback requires an owner.");
    const generation = ++this.playbackGeneration;
    this.pendingPlaybackOwner = ownerId;
    await this.cancelRecording("replaced");
    const prior = this.playbackTransition;
    const operation = prior.catch(() => undefined).then(async () => {
      if (generation !== this.playbackGeneration || this.pendingPlaybackOwner !== ownerId) return;
      if (this.playback?.ownerId === ownerId) {
        this.pendingPlaybackOwner = null;
        this.playback.player.play();
        this.playback.playing = true;
        this.emitPlaybackEvent({ type: "playing", ownerId });
        return;
      }
      this.releasePlayback("replaced", false);
      await this.native.configurePlayback();
      if (generation !== this.playbackGeneration || this.pendingPlaybackOwner !== ownerId || !this.lifecycle.isActive()) {
        await this.native.deactivate().catch(() => undefined);
        return;
      }
      const player = this.native.createPlayer(uri);
      const unsubscribeFinished = player.onFinished(() => {
        this.stopPlayback(ownerId, "completed");
      });
      this.pendingPlaybackOwner = null;
      this.playback = { ownerId, player, unsubscribeFinished, playing: true };
      player.play();
      this.emitPlaybackEvent({ type: "playing", ownerId });
    });
    this.playbackTransition = operation.catch(() => undefined);
    await operation;
  }

  pause(ownerId: string): boolean {
    if (!this.playback || this.playback.ownerId !== ownerId) return false;
    this.playback.player.pause();
    this.playback.playing = false;
    this.emitPlaybackEvent({ type: "paused", ownerId });
    return true;
  }

  stopPlayback(ownerId?: string, reason: AudioPlaybackStopReason = "cleanup"): boolean {
    const cancelsPending = this.pendingPlaybackOwner !== null && (ownerId === undefined || this.pendingPlaybackOwner === ownerId);
    if (cancelsPending) {
      this.playbackGeneration += 1;
      this.pendingPlaybackOwner = null;
    }
    const stopsActive = Boolean(this.playback && (ownerId === undefined || this.playback.ownerId === ownerId));
    if (stopsActive) this.releasePlayback(reason, true);
    return cancelsPending || stopsActive;
  }

  async releaseRecording(uri: string): Promise<void> {
    if (!this.recordings.delete(uri)) return;
    await this.native.delete(uri);
  }

  async cleanup(): Promise<void> {
    await this.cancelRecording("cleanup");
    this.stopPlayback(undefined, "cleanup");
    await this.playbackTransition.catch(() => undefined);
    const recordings = [...this.recordings];
    this.recordings.clear();
    await Promise.allSettled(recordings.map((uri) => this.native.delete(uri)));
    await this.native.deactivate().catch(() => undefined);
  }

  async dispose(): Promise<void> {
    this.unsubscribeLifecycle();
    this.unregisterCleanup();
    await this.cleanup();
    this.recordingListeners.clear();
    this.playbackListeners.clear();
  }

  private async interrupt(reason: AudioRecordingInterruptionReason): Promise<void> {
    await this.cancelRecording(reason);
    this.stopPlayback(undefined, reason === "background" ? "background" : "cleanup");
  }

  private async finalizeRecording(
    reason: AudioRecordingCompletionReason
  ): Promise<RecordedAudio> {
    if (this.recordingFinalization) return this.recordingFinalization;
    const recorder = this.recorder;
    if (!recorder) throw new Error("No voice note is being recorded.");
    const generation = ++this.operationGeneration;
    this.recorder = null;
    this.clearRecordingTimer();

    const operation = this.finishRecording(recorder, generation);
    this.recordingFinalization = operation;
    try {
      const recording = await operation;
      this.emitRecordingEvent({ type: "completed", reason, recording });
      return recording;
    } catch (cause) {
      if (generation === this.operationGeneration) {
        this.emitRecordingEvent({
          type: "failed",
          error: cause instanceof Error ? cause : new Error("The voice note could not be completed.")
        });
      }
      throw cause;
    } finally {
      if (this.recordingFinalization === operation) this.recordingFinalization = null;
    }
  }

  private async finishRecording(
    recorder: RecorderPort,
    generation: number
  ): Promise<RecordedAudio> {
    let uri = recorder.uri;
    let durationMillis = 0;
    try {
      try {
        await recorder.stop();
        uri = recorder.uri ?? uri;
        durationMillis = Math.max(0, Math.round(recorder.currentTime * 1_000));
      } finally {
        recorder.release();
        await this.native.deactivate().catch(() => undefined);
      }
      if (!uri?.startsWith("file://")) {
        throw new Error("The recorded voice note is unavailable.");
      }
      const file = await this.native.stat(uri);
      if (!file.exists || file.sizeBytes < 1) {
        throw new Error("The recorded voice note is empty.");
      }
      if (generation !== this.operationGeneration || !this.lifecycle.isActive()) {
        throw new AudioRecordingInterruptedError();
      }
      this.recordings.add(uri);
      return Object.freeze({
        uri,
        fileName: `voice-note-${Date.now()}${VOICE_RECORDING_EXTENSION}`,
        mimeType: VOICE_RECORDING_MIME_TYPE,
        durationMillis,
        sizeBytes: file.sizeBytes
      });
    } catch (error) {
      if (uri) await this.native.delete(uri).catch(() => undefined);
      throw error;
    }
  }

  private emitRecordingEvent(event: AudioRecordingLifecycleEvent): void {
    for (const listener of this.recordingListeners) {
      try {
        listener(event);
      } catch {
        // A UI listener cannot compromise audio resource cleanup.
      }
    }
  }

  private emitPlaybackEvent(event: AudioPlaybackLifecycleEvent): void {
    for (const listener of this.playbackListeners) {
      try {
        listener(event);
      } catch {
        // One consumer cannot interrupt audio lifecycle cleanup for another.
      }
    }
  }

  private releasePlayback(reason: AudioPlaybackStopReason, deactivate: boolean): void {
    const playback = this.playback;
    if (!playback) return;
    this.playback = null;
    playback.unsubscribeFinished();
    playback.player.pause();
    playback.player.release();
    this.emitPlaybackEvent({ type: "stopped", ownerId: playback.ownerId, reason });
    if (!deactivate) return;
    const prior = this.playbackTransition;
    const deactivation = this.native.deactivate().catch(() => undefined);
    this.playbackTransition = Promise.allSettled([prior, deactivation]).then(() => undefined);
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer) clearTimeout(this.recordingTimer);
    this.recordingTimer = null;
  }

  private assertActiveGeneration(generation: number): void {
    if (generation !== this.operationGeneration || !this.lifecycle.isActive()) {
      throw new AudioRecordingInterruptedError();
    }
  }
}
