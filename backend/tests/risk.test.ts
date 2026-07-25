import { describe, expect, it } from "vitest";

import type { KpiTask } from "../src/contracts/domain.js";
import { calculateTaskRisk } from "../src/domain/risk.js";

const at = (value: string) => new Date(value);

const task = (overrides: Record<string, unknown> = {}) => ({
  id: "task-1",
  plannedStartAt: "2026-07-01T00:00:00.000Z",
  currentDeadlineAt: "2026-07-11T00:00:00.000Z",
  plannedEffort: 8,
  progress: 0,
  status: "not_started",
  ...overrides
});

describe("calculateTaskRisk", () => {
  it("marks an unstarted task before its planned start gray", () => {
    const result = calculateTaskRisk(task(), at("2026-06-30T23:59:59.999Z"));

    expect(result).toEqual({
      level: "gray",
      reason: "Task has not started.",
      elapsedRatio: 0,
      progressRatio: 0
    });
  });

  it("marks a task green when its buffer is at least twenty percentage points", () => {
    const result = calculateTaskRisk(
      task({ progress: 70, status: "in_progress" }),
      at("2026-07-06T00:00:00.000Z")
    );

    expect(result).toEqual({
      level: "green",
      reason: "Task is on track with sufficient schedule buffer.",
      elapsedRatio: 0.5,
      progressRatio: 0.7,
      forecastCompletion: "2026-07-08T03:25:42.857Z"
    });
  });

  it("marks a task yellow when its positive buffer is below twenty percentage points", () => {
    const result = calculateTaskRisk(
      task({ progress: 60, status: "in_progress" }),
      at("2026-07-06T00:00:00.000Z")
    );

    expect(result).toEqual({
      level: "yellow",
      reason: "Task has less than a 20 percentage-point schedule buffer.",
      elapsedRatio: 0.5,
      progressRatio: 0.6,
      forecastCompletion: "2026-07-09T08:00:00.000Z"
    });
  });

  it("marks a task yellow when its forecast crosses the deadline", () => {
    const result = calculateTaskRisk(
      task({ progress: 40, status: "in_progress" }),
      at("2026-07-06T00:00:00.000Z")
    );

    expect(result).toEqual({
      level: "yellow",
      reason: "Task is forecast to finish after its deadline.",
      elapsedRatio: 0.5,
      progressRatio: 0.4,
      forecastCompletion: "2026-07-13T12:00:00.000Z"
    });
  });

  it("marks a blocked task yellow before considering its healthy progress", () => {
    const result = calculateTaskRisk(
      task({ progress: 80, status: "blocked" }),
      at("2026-07-06T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      level: "yellow",
      reason: "Task is blocked."
    });
  });

  it("marks an incomplete task yellow when its deadline is exactly two calendar days away", () => {
    const result = calculateTaskRisk(
      task({ progress: 90, status: "in_progress" }),
      at("2026-07-09T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      level: "yellow",
      reason: "Task is due within two calendar days."
    });
  });

  it("marks an incomplete task red immediately after its deadline", () => {
    const result = calculateTaskRisk(
      task({ progress: 99, status: "in_progress" }),
      at("2026-07-11T00:00:00.001Z")
    );

    expect(result).toMatchObject({
      level: "red",
      reason: "Task is overdue."
    });
  });

  it("keeps overdue blocked work red because deadline breaches outrank blocked status", () => {
    const result = calculateTaskRisk(
      task({ progress: 50, status: "blocked" }),
      at("2026-07-11T00:00:00.001Z")
    );

    expect(result).toMatchObject({
      level: "red",
      reason: "Task is overdue."
    });
  });

  it("rejects a completed task that omits its completion timestamp", () => {
    const invalidCompletedTask = task({ status: "completed" }) as unknown as KpiTask;

    expect(() => calculateTaskRisk(invalidCompletedTask, at("2026-07-12T00:00:00.000Z"))).toThrow(
      "Completed tasks require completedAt."
    );
  });

  it("marks a completed task green when it completed at its deadline", () => {
    const result = calculateTaskRisk(
      task({
        progress: 100,
        status: "completed",
        completedAt: "2026-07-11T00:00:00.000Z"
      }),
      at("2026-07-12T00:00:00.000Z")
    );

    expect(result).toEqual({
      level: "green",
      reason: "Task was completed on or before its deadline.",
      elapsedRatio: 1,
      progressRatio: 1
    });
  });

  it("marks a completed task red when it completed after its deadline", () => {
    const result = calculateTaskRisk(
      task({
        progress: 100,
        status: "completed",
        completedAt: "2026-07-11T00:00:00.001Z"
      }),
      at("2026-07-12T00:00:00.000Z")
    );

    expect(result).toEqual({
      level: "red",
      reason: "Task was completed after its deadline.",
      elapsedRatio: 1,
      progressRatio: 1
    });
  });
});
