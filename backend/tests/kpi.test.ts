import { describe, expect, it } from "vitest";

import { calculateKpi, weightedAverage } from "../src/domain/kpi.js";

const at = (value: string) => new Date(value);
const period = {
  periodStartAt: "2026-07-01T00:00:00.000Z",
  periodEndAt: "2026-07-31T23:59:59.999Z",
  now: at("2026-07-31T23:59:59.999Z")
};

const task = (overrides: Record<string, unknown> = {}) => ({
  id: "task-1",
  plannedStartAt: "2026-07-01T00:00:00.000Z",
  currentDeadlineAt: "2026-07-11T00:00:00.000Z",
  plannedEffort: 1,
  progress: 100,
  status: "completed",
  completedAt: "2026-07-11T00:00:00.000Z",
  ...overrides
});

const component = (input: Parameters<typeof calculateKpi>[0], key: string) => {
  const result = calculateKpi(input);
  const found = result.components.find((item) => item.key === key);
  if (!found) throw new Error(`Missing ${key} component`);
  return found;
};

describe("weightedAverage", () => {
  it("uses positive weights and ignores zero-weight items", () => {
    expect(
      weightedAverage([
        { score: 100, weight: 9 },
        { score: 0, weight: 1 },
        { score: 0, weight: 0 }
      ])
    ).toBe(90);
  });
});

describe("calculateKpi", () => {
  it("scores every on-time timing band with planned-duration boundaries", () => {
    const result = component(
      {
        ...period,
        tasks: [
          task({ id: "on-time" }),
          task({ id: "recovered", wasYellow: true }),
          task({ id: "ten-percent-late", completedAt: "2026-07-12T00:00:00.000Z" }),
          task({ id: "twenty-five-percent-late", completedAt: "2026-07-13T12:00:00.000Z" }),
          task({ id: "more-than-twenty-five-percent-late", completedAt: "2026-07-13T12:00:00.001Z" }),
          task({
            id: "still-overdue",
            status: "in_progress",
            progress: 80,
            completedAt: null,
            currentDeadlineAt: "2026-07-10T00:00:00.000Z"
          })
        ]
      },
      "onTime"
    );

    expect(result).toMatchObject({ score: 50, eligibleCount: 6 });
  });

  it("scores approval versions and rejects unapproved work after a deadline", () => {
    const result = component(
      {
        ...period,
        tasks: [
          task({ id: "first", approvalVersion: 1, approvalStatus: "approved" }),
          task({ id: "second", approvalVersion: 2, approvalStatus: "approved" }),
          task({ id: "third", approvalVersion: 3, approvalStatus: "approved" }),
          task({ id: "fourth", approvalVersion: 4, approvalStatus: "approved" }),
          task({ id: "fifth", approvalVersion: 5, approvalStatus: "approved" }),
          task({
            id: "unapproved-overdue",
            status: "in_review",
            progress: 80,
            completedAt: null,
            approvalStatus: "unapproved",
            currentDeadlineAt: "2026-07-10T00:00:00.000Z"
          })
        ]
      },
      "quality"
    );

    expect(result).toMatchObject({ score: 48.3, eligibleCount: 6 });
  });

  it("deducts twenty points for each revision after the tolerated first revision", () => {
    const result = component(
      {
        ...period,
        tasks: [
          task({ id: "one", hasReview: true, revisionCount: 1 }),
          task({ id: "two", hasReview: true, revisionCount: 2 }),
          task({ id: "six", hasReview: true, revisionCount: 6 })
        ]
      },
      "revisionEfficiency"
    );

    expect(result).toMatchObject({ score: 60, eligibleCount: 3 });
  });

  it("counts an update in each two-business-day active window as timely", () => {
    const result = component(
      {
        periodStartAt: "2026-07-06T00:00:00.000Z",
        periodEndAt: "2026-07-10T00:00:00.000Z",
        now: at("2026-07-10T00:00:00.000Z"),
        tasks: [
          task({
            id: "timely",
            plannedStartAt: "2026-07-06T00:00:00.000Z",
            currentDeadlineAt: "2026-07-31T00:00:00.000Z",
            status: "in_progress",
            progress: 50,
            completedAt: null,
            updateEvents: [
              { occurredAt: "2026-07-07T12:00:00.000Z" },
              { occurredAt: "2026-07-09T12:00:00.000Z" }
            ]
          }),
          task({
            id: "missed",
            plannedStartAt: "2026-07-06T00:00:00.000Z",
            currentDeadlineAt: "2026-07-31T00:00:00.000Z",
            status: "in_progress",
            progress: 50,
            completedAt: null,
            updateEvents: [{ occurredAt: "2026-07-07T12:00:00.000Z" }]
          })
        ]
      },
      "updateDiscipline"
    );

    expect(result).toMatchObject({ score: 75, eligibleCount: 2 });
  });

  it("effort-weights update discipline across task window scores", () => {
    const result = component(
      {
        periodStartAt: "2026-07-06T00:00:00.000Z",
        periodEndAt: "2026-07-10T00:00:00.000Z",
        now: at("2026-07-10T00:00:00.000Z"),
        tasks: [
          task({
            id: "high-effort-missed",
            plannedStartAt: "2026-07-06T00:00:00.000Z",
            currentDeadlineAt: "2026-07-07T00:00:00.000Z",
            plannedEffort: 9,
            status: "in_progress",
            progress: 50,
            completedAt: null,
            updateEvents: []
          }),
          task({
            id: "low-effort-timely",
            plannedStartAt: "2026-07-06T00:00:00.000Z",
            currentDeadlineAt: "2026-07-07T00:00:00.000Z",
            plannedEffort: 1,
            status: "in_progress",
            progress: 50,
            completedAt: null,
            updateEvents: [
              { occurredAt: "2026-07-06T12:00:00.000Z" },
              { occurredAt: "2026-07-08T12:00:00.000Z" }
            ]
          })
        ]
      },
      "updateDiscipline"
    );

    expect(result).toMatchObject({ score: 10, eligibleCount: 2 });
  });

  it("uses completion as an update-discipline lifecycle end", () => {
    const result = component(
      {
        periodStartAt: "2026-07-06T00:00:00.000Z",
        periodEndAt: "2026-07-10T00:00:00.000Z",
        now: at("2026-07-10T00:00:00.000Z"),
        tasks: [
          task({
            id: "completed-with-updates",
            plannedStartAt: "2026-07-06T00:00:00.000Z",
            currentDeadlineAt: "2026-07-07T00:00:00.000Z",
            completedAt: "2026-07-10T00:00:00.000Z",
            updateEvents: [
              { occurredAt: "2026-07-06T12:00:00.000Z" },
              { occurredAt: "2026-07-08T12:00:00.000Z" }
            ]
          })
        ]
      },
      "updateDiscipline"
    );

    expect(result).toMatchObject({ score: 100, eligibleCount: 1 });
  });

  it("does not count an event before the actual active start instant", () => {
    const result = component(
      {
        periodStartAt: "2026-07-06T00:00:00.000Z",
        periodEndAt: "2026-07-08T12:00:00.000Z",
        now: at("2026-07-08T12:00:00.000Z"),
        tasks: [
          task({
            id: "precise-boundary",
            plannedStartAt: "2026-07-06T12:00:00.000Z",
            currentDeadlineAt: "2026-07-31T00:00:00.000Z",
            status: "in_progress",
            progress: 50,
            completedAt: null,
            updateEvents: [{ occurredAt: "2026-07-06T11:59:59.999Z" }]
          })
        ]
      },
      "updateDiscipline"
    );

    expect(result).toMatchObject({ score: 0, eligibleCount: 1 });
  });

  it("does not require a partial two-business-day window", () => {
    const result = component(
      {
        periodStartAt: "2026-07-06T00:00:00.000Z",
        periodEndAt: "2026-07-08T11:59:59.999Z",
        now: at("2026-07-08T11:59:59.999Z"),
        tasks: [
          task({
            id: "partial-window",
            plannedStartAt: "2026-07-06T12:00:00.000Z",
            currentDeadlineAt: "2026-07-31T00:00:00.000Z",
            status: "in_progress",
            progress: 50,
            completedAt: null
          })
        ]
      },
      "updateDiscipline"
    );

    expect(result).toMatchObject({ score: null, eligibleCount: 0 });
  });

  it("continues requiring updates from an overdue task that remains active", () => {
    const result = component(
      {
        periodStartAt: "2026-07-06T00:00:00.000Z",
        periodEndAt: "2026-07-10T00:00:00.000Z",
        now: at("2026-07-10T00:00:00.000Z"),
        tasks: [
          task({
            id: "overdue-but-active",
            plannedStartAt: "2026-07-06T00:00:00.000Z",
            currentDeadlineAt: "2026-07-07T00:00:00.000Z",
            status: "in_progress",
            progress: 50,
            completedAt: null,
            updateEvents: [{ occurredAt: "2026-07-08T12:00:00.000Z" }]
          })
        ]
      },
      "updateDiscipline"
    );

    expect(result).toMatchObject({ score: 50, eligibleCount: 1 });
  });

  it("does not award revision efficiency to work without an explicit review", () => {
    const result = component(
      {
        ...period,
        tasks: [task({ id: "not-reviewed", hasReview: false, revisionCount: 0 })]
      },
      "revisionEfficiency"
    );

    expect(result).toMatchObject({ score: null, eligibleCount: 0 });
  });

  it("uses planned effort and defaults missing effort to one for workload completion", () => {
    const result = component(
      {
        ...period,
        tasks: [
          task({ id: "completed", plannedEffort: 3 }),
          task({
            id: "incomplete",
            plannedEffort: null,
            status: "in_progress",
            progress: 50,
            completedAt: null
          })
        ]
      },
      "workloadCompletion"
    );

    expect(result).toMatchObject({ score: 75, eligibleCount: 2 });
  });

  it("normalizes configured weights after excluding components without eligible data", () => {
    const result = calculateKpi({
      ...period,
      tasks: [task({ completedAt: "2026-07-01T00:00:00.000Z" })]
    });

    expect(result.score).toBe(100);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "onTime", score: 100, effectiveWeight: 77.8 }),
        expect.objectContaining({ key: "workloadCompletion", score: 100, effectiveWeight: 22.2 }),
        expect.objectContaining({ key: "quality", score: null, effectiveWeight: 0 }),
        expect.objectContaining({ key: "revisionEfficiency", score: null, effectiveWeight: 0 }),
        expect.objectContaining({ key: "updateDiscipline", score: null, effectiveWeight: 0 })
      ])
    );
  });

  it("uses effort weighting for eligible component scores", () => {
    const result = component(
      {
        ...period,
        tasks: [
          task({ id: "large-on-time", plannedEffort: 9 }),
          task({
            id: "small-late",
            plannedEffort: 1,
            completedAt: "2026-07-14T00:00:00.000Z"
          })
        ]
      },
      "onTime"
    );

    expect(result).toMatchObject({ score: 90, eligibleCount: 2 });
  });
});
