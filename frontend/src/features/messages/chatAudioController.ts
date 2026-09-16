import type { ChatAttachment } from "./projectChatTypes";

export type ChatAudioSource = { key: string; filename: string } & ({ file: File; attachment?: never } | { attachment: ChatAttachment; file?: never });
export interface ChatAudioState {
  key: string | null;
  status: "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";
  currentTime: number;
  duration?: number;
  progress?: number;
  error?: string;
  /** Only measured bins have values. Unplayed regions remain a neutral track. */
  peaks: ReadonlyArray<number | null>;
}
interface AudioOptions {
  load: (attachment: ChatAttachment, signal: AbortSignal, progress: (percent?: number) => void) => Promise<Blob>;
  current: () => () => boolean;
  beforeStart: () => void;
  errorMessage: (error: unknown) => string;
}
interface AudioRun {
  source: ChatAudioSource;
  controller: AbortController;
  current: () => boolean;
  audio?: HTMLAudioElement;
  url?: string;
  byteSize?: number;
  cleanup: Array<() => void>;
  wantsPlay: boolean;
  probing: boolean;
  probed: boolean;
  analysisAttempted: boolean;
  playPending: boolean;
}

export const CHAT_AUDIO_BUDGET = { maxAnalysisBytes: 8 * 1024 * 1024, maxAnalysisSeconds: 300, bins: 48, fftSize: 1024, sampleIntervalMs: 200, analysisStartTimeoutMs: 1000, durationProbeSeconds: 7 * 24 * 60 * 60, durationProbeTimeoutMs: 1500 } as const;
const idle = (): ChatAudioState => ({ key: null, status: "idle", currentTime: 0, peaks: [] });
const finiteDuration = (value: number) => Number.isFinite(value) && value > 0 ? value : undefined;

/** One downloaded/local original, native player and fixed-size live analyser per chat. */
export class ChatAudioController {
  private state = idle();
  private run: AudioRun | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly options: AudioOptions) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(value: Partial<ChatAudioState>) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener()); }
  private valid(run: AudioRun) { return this.run === run && !run.controller.signal.aborted && run.current(); }

  release = (key?: string) => {
    const run = this.run;
    if (key && run?.source.key !== key) return;
    this.run = null;
    if (run) {
      run.controller.abort();
      run.cleanup.forEach(cleanup => cleanup());
      if (run.audio) { run.audio.pause(); run.audio.removeAttribute("src"); run.audio.load(); }
      if (run.url) URL.revokeObjectURL(run.url);
    }
    this.state = idle(); this.listeners.forEach(listener => listener());
  };

  toggle = (source: ChatAudioSource) => {
    const run = this.run;
    if (run?.source.key === source.key && this.valid(run)) {
      if (this.state.status === "loading") { this.release(); return; }
      // A rejected autoplay-policy promise retains its original. Retrying must
      // call play directly in the new user gesture instead of fetching again.
      if (run.audio && (this.state.status !== "error" || !run.audio.error)) {
        if (this.state.status === "playing") { run.wantsPlay = false; run.audio.pause(); this.update({ status: "paused" }); }
        else { run.wantsPlay = true; if (this.state.status === "ended") run.audio.currentTime = 0; this.play(run); }
        return;
      }
    }
    void this.start(source, true);
  };
  download = (source: ChatAudioSource) => {
    const run = this.run;
    if (run?.source.key === source.key && run.url && this.valid(run)) this.save(run);
    else void this.start(source, false);
  };
  seek = (key: string, value: number) => {
    const run = this.run;
    if (!run || run.source.key !== key || !this.valid(run) || !run.audio || !this.state.duration || !Number.isFinite(value) || run.probing) return;
    const currentTime = Math.max(0, Math.min(this.state.duration, value));
    try { run.audio.currentTime = currentTime; this.update({ currentTime, ...(this.state.status === "ended" ? { status: "paused" as const } : {}) }); } catch { /* The browser may not expose a seekable range yet. */ }
  };
  private save(run: AudioRun) {
    if (!run.url || !this.valid(run)) return;
    const link = document.createElement("a"); link.href = run.url; link.download = run.source.filename; link.click();
  }
  private async start(source: ChatAudioSource, wantsPlay: boolean) {
    this.release(); this.options.beforeStart();
    const run: AudioRun = { source, controller: new AbortController(), current: this.options.current(), cleanup: [], wantsPlay, probing: false, probed: false, analysisAttempted: false, playPending: false };
    this.run = run; this.update({ key: source.key, status: "loading" });
    try {
      const blob = source.file ?? await this.options.load(source.attachment, run.controller.signal, progress => { if (this.valid(run)) this.update({ progress }); });
      if (!this.valid(run)) return;
      run.byteSize = blob.size; run.url = URL.createObjectURL(blob);
      const audio = new Audio(); run.audio = audio; audio.preload = "metadata";
      const listen = (event: string, callback: () => void) => { const guarded = () => { if (this.valid(run)) callback(); }; audio.addEventListener(event, guarded); run.cleanup.push(() => audio.removeEventListener(event, guarded)); };
      listen("loadedmetadata", () => this.metadata(run));
      listen("durationchange", () => this.metadata(run));
      listen("canplay", () => { if (!run.probing && run.wantsPlay && audio.paused) this.play(run); });
      listen("timeupdate", () => { if (!run.probing) this.update({ currentTime: Math.max(0, Number.isFinite(audio.currentTime) ? audio.currentTime : 0) }); });
      listen("playing", () => { this.update({ status: "playing", error: undefined }); this.analyse(run); });
      listen("pause", () => { if (!run.probing && this.state.status === "playing") this.update({ status: "paused" }); });
      listen("ended", () => {
        if (run.probing) return;
        run.wantsPlay = false;
        const duration = this.state.duration ?? finiteDuration(audio.currentTime);
        this.update({ status: "ended", duration, currentTime: duration ?? 0 });
      });
      listen("error", () => { run.wantsPlay = false; this.update({ status: "error", error: "This browser cannot play this audio. Retry or download the original." }); });
      audio.src = run.url; audio.load();
      this.update({ status: wantsPlay ? "loading" : "ready", progress: undefined });
      if (!wantsPlay) this.save(run);
      // Play is explicit user intent. Metadata discovery can temporarily defer it.
      if (audio.readyState >= 1) this.metadata(run);
    } catch (error) {
      if (this.valid(run)) this.update({ status: "error", error: this.options.errorMessage(error), progress: undefined });
    }
  }
  private metadata(run: AudioRun) {
    const audio = run.audio!;
    const duration = finiteDuration(audio.duration);
    if (duration) this.update({ duration });
    if (duration && this.state.status === "playing") this.analyse(run);
    if (audio.duration === Infinity && !run.probed) {
      // Complete MediaRecorder WebM may omit duration. Ask the native demuxer
      // for its end using this already bounded local blob; never decode it here.
      run.probed = true; run.probing = true; audio.muted = true;
      const finish = () => {
        if (!this.valid(run) || !run.probing) return;
        run.probing = false;
        const discovered = finiteDuration(audio.duration);
        if (discovered) this.update({ duration: discovered });
        audio.removeEventListener("seeked", finish); clearTimeout(timer);
        try { audio.currentTime = 0; } catch { /* Retain unknown duration if seeking is unsupported. */ }
        audio.muted = false;
        if (run.wantsPlay) this.play(run);
      };
      const timer = setTimeout(finish, CHAT_AUDIO_BUDGET.durationProbeTimeoutMs);
      audio.addEventListener("seeked", finish);
      run.cleanup.push(() => { clearTimeout(timer); audio.removeEventListener("seeked", finish); });
      try { audio.currentTime = CHAT_AUDIO_BUDGET.durationProbeSeconds; } catch { finish(); }
      return;
    }
    if (!run.probing && run.wantsPlay && audio.paused) this.play(run);
  }
  private play(run: AudioRun) {
    if (!this.valid(run) || run.probing || run.playPending || !run.audio) return;
    const audio = run.audio;
    run.playPending = true;
    try {
      void Promise.resolve(audio.play()).then(() => {
        run.playPending = false;
        if (!this.valid(run) || !run.wantsPlay) { audio.pause(); return; }
        this.update({ status: "playing", error: undefined }); this.analyse(run);
      }).catch(() => { run.playPending = false; if (this.valid(run)) { run.wantsPlay = false; this.update({ status: "error", error: "Playback could not start. Retry or download the original." }); } });
    } catch { run.playPending = false; run.wantsPlay = false; this.update({ status: "error", error: "Playback could not start. Retry or download the original." }); }
  }
  private analyse(run: AudioRun) {
    const duration = this.state.duration;
    if (run.analysisAttempted || !duration || duration > CHAT_AUDIO_BUDGET.maxAnalysisSeconds || !run.byteSize || run.byteSize > CHAT_AUDIO_BUDGET.maxAnalysisBytes || typeof AudioContext === "undefined") return;
    run.analysisAttempted = true;
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch { return; }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let source: MediaElementAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    const close = () => {
      if (cancelled) return;
      cancelled = true; clearTimeout(startTimer); clearInterval(timer);
      source?.disconnect(); analyser?.disconnect(); void context.close().catch(() => undefined);
    };
    const startTimer = setTimeout(close, CHAT_AUDIO_BUDGET.analysisStartTimeoutMs);
    run.cleanup.push(close);
    // A suspended Web Audio context must never take over native playback.
    // Resume first, and leave the element un-routed on denial or timeout.
    void context.resume().then(() => {
      if (cancelled || !this.valid(run) || context.state !== "running") { close(); return; }
      clearTimeout(startTimer);
      try {
        analyser = context.createAnalyser(); analyser.fftSize = CHAT_AUDIO_BUDGET.fftSize;
        analyser.connect(context.destination);
        source = context.createMediaElementSource(run.audio!); source.connect(analyser);
        const samples = new Float32Array(CHAT_AUDIO_BUDGET.fftSize);
        const peaks: Array<number | null> = Array.from({ length: CHAT_AUDIO_BUDGET.bins }, () => null);
        // Fixed buffers, at most five samples/second. No decodeAudioData or PCM cache.
        timer = setInterval(() => {
          if (!this.valid(run) || this.state.status !== "playing" || run.probing) return;
          analyser!.getFloatTimeDomainData(samples);
          let peak = 0; for (const value of samples) peak = Math.max(peak, Math.abs(value));
          const bin = Math.min(peaks.length - 1, Math.floor(Math.max(0, run.audio!.currentTime) / duration * peaks.length));
          peaks[bin] = Math.max(peaks[bin] ?? 0, Math.min(1, peak));
          this.update({ peaks: [...peaks] });
        }, CHAT_AUDIO_BUDGET.sampleIntervalMs);
      } catch {
        // Preserve a running direct route if the browser created a source node.
        if (source) { source.disconnect(); source.connect(context.destination); analyser?.disconnect(); }
        else close();
      }
    }).catch(close);
  }
}
