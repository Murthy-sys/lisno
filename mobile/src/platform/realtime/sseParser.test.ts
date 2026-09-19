import { SseParser, SseProtocolError } from "./sseParser";

describe("SseParser", () => {
  it("parses chunked CRLF events and preserves the last event id", () => {
    const parser = new SseParser();
    expect(parser.feed("id: event-1\r\nevent: notification\r\ndata: {\"part\":" )).toEqual([]);
    expect(parser.feed("1}\r\n\r\ndata: next\n\n")).toEqual([
      {
        id: "event-1",
        event: "notification",
        data: '{"part":1}',
        retryMs: null
      },
      {
        id: "event-1",
        event: "message",
        data: "next",
        retryMs: null
      }
    ]);
  });

  it("joins multi-line data and accepts a bounded retry hint", () => {
    const parser = new SseParser();
    expect(parser.feed("retry: 1500\ndata: first\ndata: second\n\n")).toEqual([
      {
        id: null,
        event: "message",
        data: "first\nsecond",
        retryMs: 1500
      }
    ]);
  });

  it("ignores comments and unknown fields", () => {
    const parser = new SseParser();
    expect(parser.feed(": heartbeat\nunknown: value\ndata: ready\n\n")).toEqual([
      { id: null, event: "message", data: "ready", retryMs: null }
    ]);
  });

  it("rejects oversized frames and clears parser state", () => {
    const parser = new SseParser({ maxBufferBytes: 64, maxEventBytes: 8 });
    expect(() => parser.feed("data: 123456789\n")).toThrow(SseProtocolError);
    expect(parser.feed("data: ok\n\n")).toEqual([
      { id: null, event: "message", data: "ok", retryMs: null }
    ]);
  });
});
