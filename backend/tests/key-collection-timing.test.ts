import { describe, expect, it } from "vitest";
import type { KeyCollectionAppointment } from "../src/domain/design-workflow-state.js";
import { keyCollectionTiming, latestKeyCollectionWarning } from "../src/domain/key-collection-timing.js";

const start = Date.parse("2026-11-26T04:30:00.000Z");
const hour = 3_600_000;
const appointment: KeyCollectionAppointment = {
  mode: "within_48_hours", confirmedById: "client-one", confirmedAt: new Date(start).toISOString(),
  originalDeadlineAt: new Date(start + 48 * hour).toISOString(), deadlineAt: new Date(start + 48 * hour).toISOString(),
  assignmentRevision: "assignment-one", designerId: "designer-one", assignmentRequestId: "request-one",
  estimateId: "estimate-one", estimateVersion: 3, approvalReviewRoundId: "approval-one"
};
const at = (offset: number) => new Date(start + offset);

describe("key collection calendar timing", () => {
  it.each([
    [0, "green"], [24 * hour - 1, "green"], [24 * hour, "orange"], [24 * hour + 1, "orange"],
    [36 * hour - 1, "orange"], [36 * hour, "red"], [36 * hour + 1, "red"], [49 * hour, "red"]
  ])("uses the elapsed boundary at %i ms", (offset, zone) => {
    expect(keyCollectionTiming("project-one", appointment, at(Number(offset)))?.zone).toBe(zone);
  });
  it("warns thirty minutes before each boundary and recovers only the latest warning", () => {
    const timing = keyCollectionTiming("project-one", appointment, at(0))!;
    expect(timing).toMatchObject({ orangeAt: at(24 * hour).toISOString(), redAt: at(36 * hour).toISOString(),
      orangeWarningAt: at(23.5 * hour).toISOString(), redWarningAt: at(35.5 * hour).toISOString() });
    expect(latestKeyCollectionWarning(timing, at(23.5 * hour - 1))).toBeNull();
    expect(latestKeyCollectionWarning(timing, at(23.5 * hour))?.zone).toBe("orange");
    expect(latestKeyCollectionWarning(timing, at(35.5 * hour - 1))?.zone).toBe("orange");
    expect(latestKeyCollectionWarning(timing, at(35.5 * hour))?.zone).toBe("red");
    expect(latestKeyCollectionWarning(timing, at(60 * hour))?.zone).toBe("red");
  });
  it("uses a chosen window and clamps short-window warnings to confirmation", () => {
    const chosen = { ...appointment, mode: "chosen_datetime" as const, deadlineAt: at(8 * hour).toISOString(), originalDeadlineAt: at(8 * hour).toISOString() };
    expect(keyCollectionTiming("project-one", chosen, at(0))).toMatchObject({ orangeAt: at(4 * hour).toISOString(), redAt: at(6 * hour).toISOString() });
    const short = { ...chosen, deadlineAt: at(20 * 60_000).toISOString(), originalDeadlineAt: at(20 * 60_000).toISOString() };
    const timing = keyCollectionTiming("project-one", short, at(0))!;
    expect(timing.orangeWarningAt).toBe(appointment.confirmedAt);
    expect(timing.redWarningAt).toBe(appointment.confirmedAt);
    expect(latestKeyCollectionWarning(timing, at(0))?.zone).toBe("red");
  });
  it("does not manufacture timing from invalid or inconsistent saved dates", () => {
    for (const patch of [{ confirmedAt: "invalid" }, { deadlineAt: "invalid" }, { deadlineAt: appointment.confirmedAt },
      { originalDeadlineAt: at(49 * hour).toISOString() }, { deadlineAt: at(47 * hour).toISOString(), originalDeadlineAt: at(47 * hour).toISOString() }]) {
      expect(keyCollectionTiming("project-one", { ...appointment, ...patch }, at(0))).toBeNull();
    }
    expect(keyCollectionTiming("project-one", appointment, at(-1))).toBeNull();
    expect(keyCollectionTiming("project-one", appointment, new Date(NaN))).toBeNull();
  });
  it("keeps appointment identity stable across time but distinct across source identities", () => {
    const original = keyCollectionTiming("project-one", appointment, at(0))!.appointmentId;
    expect(keyCollectionTiming("project-one", appointment, at(30 * hour))!.appointmentId).toBe(original);
    expect(keyCollectionTiming("project-two", appointment, at(0))!.appointmentId).not.toBe(original);
    expect(keyCollectionTiming("project-one", { ...appointment, assignmentRevision: "assignment-two" }, at(0))!.appointmentId).not.toBe(original);
    expect(keyCollectionTiming("project-one", { ...appointment, approvalReviewRoundId: "approval-two" }, at(0))!.appointmentId).not.toBe(original);
  });
});
