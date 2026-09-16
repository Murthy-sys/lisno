import { apiClient } from "../../api/client";
import { chatPath, isChatDenied } from "./projectChatApi";
import type { ChatEventBatch, ChatStreamState } from "./projectChatTypes";

export interface SseFrame { event: string; data: string; id?: string }
/** Incremental UTF-8 decoding and line parsing, including CRLF split across reads. */
export class ChatSseParser {
  private decoder = new TextDecoder("utf-8", { fatal: true });
  private buffer = "";
  private event = "message";
  private data: string[] = [];
  private id: string | undefined;
  constructor(private readonly emit: (frame: SseFrame) => void) {}
  push(bytes: Uint8Array) {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    if (this.buffer.length + this.data.reduce((n, line) => n + line.length, 0) > 1024 * 1024) throw new Error("Chat stream frame exceeds limit");
    this.lines(false);
  }
  finish() {
    this.buffer += this.decoder.decode();
    this.lines(true);
    // Incomplete events at EOF are deliberately discarded and replayed on reconnect.
  }
  private lines(final: boolean) {
    while (true) {
      const end = this.buffer.search(/[\r\n]/);
      if (end < 0 || (!final && this.buffer[end] === "\r" && end === this.buffer.length - 1)) return;
      const line = this.buffer.slice(0, end);
      const separatorLength = this.buffer[end] === "\r" && this.buffer[end + 1] === "\n" ? 2 : 1;
      this.buffer = this.buffer.slice(end + separatorLength);
      if (!line) {
        if (this.data.length) this.emit({ event: this.event, data: this.data.join("\n"), id: this.id });
        this.event = "message"; this.data = []; this.id = undefined;
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") this.event = value;
        if (field === "data") this.data.push(value);
        if (field === "id" && !value.includes("\0")) this.id = value;
      }
    }
  }
}

function batchFromFrame(frame: SseFrame): ChatEventBatch {
  const batch = JSON.parse(frame.data) as ChatEventBatch;
  if (!batch || !Array.isArray(batch.events) || typeof batch.cursor !== "string" || typeof batch.resync !== "boolean" || typeof batch.hasMore !== "boolean") throw new Error("Invalid chat stream event");
  if (batch.events.length > 500 || batch.events.some(event => !event || typeof event.id !== "string" || typeof event.projectId !== "string")) throw new Error("Invalid chat events");
  return batch;
}

function retryDelay(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer); signal.removeEventListener("abort", finish);
      window.removeEventListener("online", finish); document.removeEventListener("visibilitychange", resume);
      resolve();
    };
    const resume = () => { if (document.visibilityState === "visible") finish(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    window.addEventListener("online", finish, { once: true }); document.addEventListener("visibilitychange", resume);
    if (signal.aborted) finish();
  });
}

export async function runProjectChatStream(options: {
  projectId: string; cursor: string; signal: AbortSignal;
  onBatch: (batch: ChatEventBatch) => void;
  onStatus: (status: ChatStreamState["status"]) => void;
  onDenied: () => void;
  connect?: typeof apiClient.stream;
}) {
  const { signal, onStatus, onDenied, projectId, onBatch } = options;
  let cursor = options.cursor;
  let failures = 0;
  while (!signal.aborted) {
    onStatus(failures ? "reconnecting" : "connecting");
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal.addEventListener("abort", stop, { once: true });
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelRead = () => { void reader?.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancelRead, { once: true });
    let denied = false;
    try {
      const response = await (options.connect ?? apiClient.stream)(`${chatPath(projectId)}/events?cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal });
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("Chat streaming is unavailable");
      reader = response.body.getReader();
      const parser = new ChatSseParser(frame => {
        if (signal.aborted || controller.signal.aborted) return;
        if (frame.event === "state") {
          const state = JSON.parse(frame.data) as ChatStreamState;
          if (state.status === "denied") { denied = true; controller.abort(); return; }
          if (["live", "reconnecting", "unavailable"].includes(state.status)) onStatus(state.status);
        } else if (frame.event === "chat") {
          const batch = batchFromFrame(frame);
          if (batch.events.some(event => event.projectId !== projectId)) throw new Error("Unexpected project in stream");
          onBatch(batch);
          // Empty private-event batches also advance the durable replay position.
          cursor = batch.cursor;
          failures = 0;
        }
      });
      onStatus("live");
      while (!controller.signal.aborted) {
        clearTimeout(heartbeat);
        heartbeat = setTimeout(() => controller.abort(), 45_000);
        const next = await reader.read();
        if (next.done) { parser.finish(); break; }
        parser.push(next.value);
      }
    } catch (error) {
      if (isChatDenied(error)) denied = true;
    } finally {
      clearTimeout(heartbeat); signal.removeEventListener("abort", stop);
      controller.signal.removeEventListener("abort", cancelRead);
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      controller.abort();
    }
    if (signal.aborted) return;
    if (denied) { onStatus("denied"); onDenied(); return; }
    failures += 1;
    onStatus(failures >= 3 ? "unavailable" : "reconnecting");
    await retryDelay(signal, Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)) * (0.8 + Math.random() * 0.4));
  }
}
