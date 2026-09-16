import { createContext, useCallback, useContext, useEffect, useId, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Download, LoaderCircle, Mic, Pause, Play, RotateCcw, X } from "lucide-react";
import { chatInitials, chatSenderColor } from "./ChatActionMenu";
import { ChatAudioController, type ChatAudioSource, type ChatAudioState } from "./chatAudioController";
import "./chatAudio.css";

export const ChatAudioContext = createContext<ChatAudioController | null>(null);
const inactiveAudio: ChatAudioState = { key: null, status: "idle", currentTime: 0, peaks: [] };
export interface ChatAudioSender { id: string; name: string }
export function audioTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—:—";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function ChatAudioBubble({ source, sender = { id: "self", name: "You" }, timestamp, upload, error, draftLabel }: {
  source: ChatAudioSource;
  sender?: ChatAudioSender;
  timestamp?: ReactNode;
  upload?: string;
  error?: string;
  draftLabel?: boolean;
}) {
  const controller = useContext(ChatAudioContext);
  if (!controller) throw new Error("Chat audio requires ChatMediaProvider.");
  const snapshot = useCallback(() => {
    const value = controller.getSnapshot();
    return value.key === source.key ? value : inactiveAudio;
  }, [controller, source.key]);
  const state = useSyncExternalStore(controller.subscribe, snapshot);
  const description = useId();
  const active = state.key === source.key;
  const playing = active && state.status === "playing";
  const loading = active && state.status === "loading";
  const playbackError = active ? state.error : undefined;
  const duration = active ? state.duration : undefined;
  const position = active ? state.currentTime : 0;
  const peaks = active ? state.peaks : [];
  const progress = duration ? Math.min(100, position / duration * 100) : 0;
  useEffect(() => () => controller.release(source.key), [controller, source.key]);
  const buttonLabel = loading ? `Cancel loading ${source.filename}` : playbackError ? `Retry audio ${source.filename}` : `${playing ? "Pause" : "Play"} ${source.filename}`;
  return <div className="project-chat-audio" role="group" aria-label={`Audio: ${source.filename}`}>
    <span id={description} className="sr-only">{source.filename}. {duration ? `Duration ${audioTime(duration)}.` : "Duration available after loading."} Waveform builds from measured sound during playback.</span>
    <div className="project-chat-audio__main">
      <button type="button" className="project-chat-audio__play" aria-label={buttonLabel} onClick={() => controller.toggle(source)} aria-describedby={description}>
        {loading ? <><LoaderCircle className="project-chat-audio__loading" size={26} aria-hidden="true" /><X className="project-chat-audio__cancel" size={11} aria-hidden="true" /></> : playbackError ? <RotateCcw size={23} aria-hidden="true" /> : playing ? <Pause size={27} fill="currentColor" aria-hidden="true" /> : <Play size={27} fill="currentColor" aria-hidden="true" />}
      </button>
      <div className="project-chat-audio__track" style={{ "--audio-progress": `${progress}%` } as CSSProperties}>
        <svg viewBox="0 0 192 40" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="192" y1="20" y2="20" className="project-chat-audio__baseline" />
          {peaks.map((peak, index) => peak === null ? null : <line key={index} x1={index * 4 + 2} x2={index * 4 + 2} y1={20 - Math.max(1, Math.sqrt(peak) * 18)} y2={20 + Math.max(1, Math.sqrt(peak) * 18)} className={index / peaks.length * 100 <= progress ? "project-chat-audio__wave project-chat-audio__wave--played" : "project-chat-audio__wave"} />)}
        </svg>
        <input type="range" min={0} max={duration ?? 1} step={0.1} value={Math.min(position, duration ?? 0)} disabled={!duration || loading} aria-label={`Seek ${source.filename}`} aria-valuetext={duration ? `${audioTime(position)} of ${audioTime(duration)}` : "Duration unknown"} onChange={event => controller.seek(source.key, Number(event.target.value))} />
      </div>
      <span className="project-chat-audio__sender" role="img" title={sender.name} aria-label={`Audio from ${sender.name}`} style={{ "--audio-sender": chatSenderColor(sender.id) } as CSSProperties}>
        <span aria-hidden="true">{chatInitials(sender.name)}</span><Mic size={17} className="project-chat-audio__mic" aria-hidden="true" />
      </span>
    </div>
    <div className="project-chat-audio__details">
      <span className="project-chat-audio__duration" aria-hidden="true">{audioTime(playing || position > 0 ? position : duration)}</span>
      {loading ? <span className="project-chat-audio__transfer" role="status">{state.progress === undefined ? "Loading…" : `${state.progress}%`}</span> : null}
      <button type="button" className="project-chat-audio__download" aria-label={`Download ${source.filename}`} onClick={() => controller.download(source)}><Download size={14} aria-hidden="true" /></button>
      {timestamp ? <span className="project-chat-audio__time">{timestamp}</span> : null}
    </div>
    {draftLabel ? <span className="project-chat-audio__filename" title={source.filename}>{source.filename}</span> : null}
    {upload ? <span className="project-chat-audio__status" role="status">{upload}</span> : null}
    {error ? <p className="project-chat-audio__error" role="status">{error}</p> : null}
    {playbackError && playbackError !== error ? <p className="project-chat-audio__error" role="status">{playbackError}</p> : null}
  </div>;
}
