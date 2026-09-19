export interface ServerSentEvent {
  readonly id: string | null;
  readonly event: string;
  readonly data: string;
  readonly retryMs: number | null;
}

export class SseProtocolError extends Error {
  readonly code = "SSE_PROTOCOL_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "SseProtocolError";
  }
}

export interface SseParserOptions {
  readonly maxBufferBytes?: number;
  readonly maxEventBytes?: number;
}

const DEFAULT_MAX_BUFFER_BYTES = 256 * 1024;
const DEFAULT_MAX_EVENT_BYTES = 128 * 1024;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export class SseParser {
  private buffer = "";
  private eventId: string | null = null;
  private eventType = "message";
  private dataLines: string[] = [];
  private retryMs: number | null = null;

  private readonly maxBufferBytes: number;
  private readonly maxEventBytes: number;

  constructor(options: SseParserOptions = {}) {
    this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
    this.maxEventBytes = options.maxEventBytes ?? DEFAULT_MAX_EVENT_BYTES;
    if (this.maxBufferBytes < 1 || this.maxEventBytes < 1) {
      throw new Error("SSE parser limits must be positive.");
    }
  }

  feed(chunk: string): readonly ServerSentEvent[] {
    this.buffer += chunk;
    if (byteLength(this.buffer) > this.maxBufferBytes) {
      this.reset();
      throw new SseProtocolError("The realtime stream buffer exceeded its limit.");
    }

    const events: ServerSentEvent[] = [];
    let lineEnd = this.buffer.indexOf("\n");
    while (lineEnd >= 0) {
      let line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      const event = this.acceptLine(line);
      if (event) events.push(event);
      lineEnd = this.buffer.indexOf("\n");
    }

    return Object.freeze(events);
  }

  finish(): readonly ServerSentEvent[] {
    const events = this.buffer.length > 0 ? [...this.feed("\n")] : [];
    const finalEvent = this.dispatch();
    if (finalEvent) events.push(finalEvent);
    this.buffer = "";
    return Object.freeze(events);
  }

  reset(): void {
    this.buffer = "";
    this.eventId = null;
    this.eventType = "message";
    this.dataLines = [];
    this.retryMs = null;
  }

  private acceptLine(line: string): ServerSentEvent | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;

    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "data":
        this.dataLines.push(value);
        break;
      case "event":
        this.eventType = value || "message";
        break;
      case "id":
        if (!value.includes("\u0000")) this.eventId = value;
        break;
      case "retry":
        if (/^\d+$/u.test(value)) this.retryMs = Number(value);
        break;
      default:
        break;
    }

    if (byteLength(this.dataLines.join("\n")) > this.maxEventBytes) {
      this.reset();
      throw new SseProtocolError("A realtime event exceeded its limit.");
    }
    return null;
  }

  private dispatch(): ServerSentEvent | null {
    if (this.dataLines.length === 0) {
      this.eventType = "message";
      this.retryMs = null;
      return null;
    }

    const event = Object.freeze({
      id: this.eventId,
      event: this.eventType,
      data: this.dataLines.join("\n"),
      retryMs: this.retryMs
    });
    this.eventType = "message";
    this.dataLines = [];
    this.retryMs = null;
    return event;
  }
}
