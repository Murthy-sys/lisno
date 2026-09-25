import { describe, expect, it } from "vitest";

import {
  formatKnowledgeRelativeTime,
  latestKnowledgeSectionSave,
  type KnowledgeSaveStamp
} from "./knowledgeLastSaved";

const CREATED_AT = "2026-09-20T04:30:00.000Z";

function stamp(updatedAt: string, createdAt = CREATED_AT): KnowledgeSaveStamp {
  return { createdAt, updatedAt };
}

describe("latestKnowledgeSectionSave", () => {
  it("returns null when the tab has no envelopes", () => {
    expect(latestKnowledgeSectionSave([])).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null]
  ])("returns null while any envelope is still %s", (_state, missing) => {
    const saved = stamp("2026-09-24T10:00:00.000Z");

    expect(latestKnowledgeSectionSave([saved, missing])).toBeNull();
    expect(latestKnowledgeSectionSave([missing, saved])).toBeNull();
    expect(latestKnowledgeSectionSave([missing])).toBeNull();
  });

  it("returns null when no envelope was saved after creation", () => {
    expect(latestKnowledgeSectionSave([stamp(CREATED_AT)])).toBeNull();
    expect(
      latestKnowledgeSectionSave([
        stamp(CREATED_AT),
        // The same instant written with an offset is still not a save.
        stamp("2026-09-20T10:00:00+05:30"),
        stamp("2026-09-20T04:29:59.999Z")
      ])
    ).toBeNull();
  });

  it("ignores envelopes whose stamps do not parse", () => {
    expect(
      latestKnowledgeSectionSave([
        stamp("not-a-date"),
        stamp("2026-09-24T10:00:00.000Z", "not-a-date"),
        stamp("", "")
      ])
    ).toBeNull();
    expect(
      latestKnowledgeSectionSave([
        stamp("not-a-date"),
        stamp("2026-09-23T08:00:00.000Z"),
        stamp("2026-09-25T09:00:00.000Z", "")
      ])
    ).toBe("2026-09-23T08:00:00.000Z");
  });

  it("skips a later never-saved envelope and returns the saved one", () => {
    const copiedIntoDraft = "2026-09-25T06:00:00.000Z";

    expect(
      latestKnowledgeSectionSave([
        stamp(copiedIntoDraft, copiedIntoDraft),
        stamp("2026-09-22T11:15:00.000Z")
      ])
    ).toBe("2026-09-22T11:15:00.000Z");
  });

  it("returns the latest save by instant rather than by text, in any order", () => {
    const envelopes = [
      stamp("2026-09-24T12:00:00.000+05:30"),
      stamp("2026-09-24T07:00:00.000Z"),
      stamp("2026-09-21T09:45:00.000Z")
    ];

    expect(latestKnowledgeSectionSave(envelopes)).toBe(
      "2026-09-24T07:00:00.000Z"
    );
    expect(latestKnowledgeSectionSave([...envelopes].reverse())).toBe(
      "2026-09-24T07:00:00.000Z"
    );
  });

  it.each([
    "2026-09-24T10:15:30.123Z",
    "2026-09-24T10:15:30Z",
    "2026-09-24T18:00:00.250+05:30"
  ])("returns the original updatedAt string %s unchanged", (original) => {
    expect(
      latestKnowledgeSectionSave([
        stamp("2026-09-23T00:00:00.000Z"),
        stamp(original)
      ])
    ).toBe(original);
  });
});

describe("formatKnowledgeRelativeTime", () => {
  const NOW = Date.parse("2026-09-25T12:00:00.000Z");
  const SECOND = 1_000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  function savedAgo(elapsedMs: number): string {
    return new Date(NOW - elapsedMs).toISOString();
  }

  it.each([
    ["0s", "just now", 0],
    ["59s", "just now", 59 * SECOND],
    ["60s", "1 minute ago", 60 * SECOND],
    ["119s", "1 minute ago", 119 * SECOND],
    ["120s", "2 minutes ago", 120 * SECOND],
    ["59m", "59 minutes ago", 59 * MINUTE],
    ["59m 59s", "59 minutes ago", 59 * MINUTE + 59 * SECOND],
    ["60m", "1 hour ago", 60 * MINUTE],
    ["23h", "23 hours ago", 23 * HOUR],
    ["23h 59m", "23 hours ago", 23 * HOUR + 59 * MINUTE],
    ["24h", "yesterday", 24 * HOUR],
    ["47h", "yesterday", 47 * HOUR],
    ["48h", "2 days ago", 48 * HOUR],
    ["29d", "29 days ago", 29 * DAY],
    ["30d", "last month", 30 * DAY],
    ["11 months", "11 months ago", 11 * 30 * DAY],
    ["12 months", "last year", 12 * 30 * DAY],
    ["730d", "2 years ago", 730 * DAY]
  ])("formats a save %s old as %j", (_age, expected, elapsedMs) => {
    expect(formatKnowledgeRelativeTime(savedAgo(elapsedMs), NOW)).toBe(
      expected
    );
  });

  it.each([
    ["1s", SECOND],
    ["5m", 5 * MINUTE]
  ])("reads a stamp %s in the future as just now", (_skew, skewMs) => {
    expect(formatKnowledgeRelativeTime(savedAgo(-skewMs), NOW)).toBe(
      "just now"
    );
  });

  it.each(["not-a-date", ""])(
    "returns null for the unparseable stamp %j",
    (timestamp) => {
      expect(formatKnowledgeRelativeTime(timestamp, NOW)).toBeNull();
    }
  );
});
