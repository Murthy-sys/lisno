import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatAttachmentPolicy } from "./projectChatTypes";

export function useChatRecorder(policy: ChatAttachmentPolicy | undefined, onFile: (file: File) => void) {
  const [state, setState] = useState<"idle" | "requesting" | "recording">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const callback = useRef(onFile); callback.current = onFile;
  const release = useCallback(() => { if (timer.current) clearInterval(timer.current); timer.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; }, []);
  const cancel = useCallback(() => {
    generation.current += 1;
    const active = recorder.current; recorder.current = null;
    if (active && active.state !== "inactive") active.stop();
    release(); setState("idle"); setElapsed(0);
  }, [release]);
  const stop = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); release(); }, [release]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === "hidden") cancel(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", cancel);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", cancel); generation.current += 1; const active = recorder.current; recorder.current = null; if (active && active.state !== "inactive") active.stop(); release(); };
  }, [cancel, release]);
  const enabled = Boolean(policy?.enabled && policy.capabilities.canUpload && policy.capabilities.canRecord);
  useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);
  async function start() {
    if (!enabled || state !== "idle" || !policy) return;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") { setError("Voice recording is unavailable in this browser. Attach an audio file instead."); return; }
    const mimeType = policy.recordingMimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError("This browser cannot record a supported audio type. Attach an audio file instead."); return; }
    const run = ++generation.current;
    setState("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (run !== generation.current || document.visibilityState === "hidden") { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const active = new MediaRecorder(media, { mimeType });
      recorder.current = active;
      const chunks: Blob[] = []; let bytes = 0;
      active.ondataavailable = event => {
        if (run !== generation.current || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > policy.limits.maxFileBytes) { cancel(); setError("The recording reached the file-size limit. Record a shorter note."); return; }
        chunks.push(event.data);
      };
      active.onerror = () => { if (run === generation.current) { cancel(); setError("Recording failed. Try again or attach an audio file."); } };
      active.onstop = () => {
        if (run !== generation.current) return;
        release();
        recorder.current = null; setState("idle");
        const actualType = active.mimeType || chunks[0]?.type || mimeType;
        const extension = actualType.startsWith("audio/mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : actualType.includes("wav") ? "wav" : "webm";
        const blob = new Blob(chunks, { type: actualType });
        if (!blob.size) { setError("No audio was recorded. Try again."); return; }
        callback.current(new File([blob], `Voice note ${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: actualType }));
      };
      active.start(1000); setState("recording"); setElapsed(0);
      const started = Date.now();
      timer.current = setInterval(() => { const seconds = Math.floor((Date.now() - started) / 1000); setElapsed(seconds); if (seconds >= policy.limits.maxRecordingSeconds) stop(); }, 250);
    } catch { if (run === generation.current) { release(); setState("idle"); setError("Microphone access was denied or unavailable. You can attach an audio file instead."); } }
  }
  return { state, elapsed, error, start, stop, cancel };
}
