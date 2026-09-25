import { describe, expect, it } from "vitest";

import type { AdminProjectSummary } from "../../api/types";
import {
  adminProjectStatusTone,
  formatCreatedRelative,
  personInitials
} from "./adminProjectPresentation";

const base: AdminProjectSummary = {
  id: "project-1",
  name: "Asha home",
  status: "planning",
  location: "Pune",
  client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
  propertyType: "3BHK",
  budgetMin: null,
  budgetMax: null,
  estimator: null,
  lead: null,
  estimate: null,
  createdAt: "2026-08-23T10:00:00.000Z"
};

function withEstimate(
  status: string,
  designPlanStatus: NonNullable<AdminProjectSummary["estimate"]>["designPlanStatus"]
): AdminProjectSummary {
  return {
    ...base,
    status: "active",
    estimate: {
      id: "estimate-1",
      leadId: "lead-1",
      projectId: "project-1",
      resolvedProjectId: "project-1",
      projectLinkSource: "estimate",
      version: 1,
      status,
      subtotal: 100,
      gst: 18,
      total: 118,
      clientDecisionAt: null,
      clientDecisionSource: null,
      approvedBaseline: null,
      designPlanStatus
    }
  };
}

describe("adminProjectStatusTone", () => {
  it.each([
    ["planning", "neutral"],
    ["active", "success"],
    ["on_hold", "danger"],
    ["completed", "complete"]
  ] as const)("maps %s to %s", (status, tone) => {
    expect(adminProjectStatusTone({ ...base, status })).toBe(tone);
  });

  it("uses info while a client-approved estimate awaits designer assignment", () => {
    expect(adminProjectStatusTone(withEstimate("client_approved", "pending_assignment"))).toBe("info");
    expect(adminProjectStatusTone(withEstimate("client_approved", null))).toBe("info");
  });

  it("falls back to the project status once a designer is assigned or the estimate is unapproved", () => {
    expect(adminProjectStatusTone(withEstimate("client_approved", "assigned"))).toBe("success");
    expect(adminProjectStatusTone(withEstimate("draft", null))).toBe("success");
  });
});

describe("formatCreatedRelative", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");

  it.each([
    ["2026-09-23T11:59:30.000Z", "Created 30 seconds ago"],
    ["2026-09-23T11:55:00.000Z", "Created 5 minutes ago"],
    ["2026-09-23T09:00:00.000Z", "Created 3 hours ago"],
    ["2026-09-22T12:00:00.000Z", "Created yesterday"],
    ["2026-09-20T12:00:00.000Z", "Created 3 days ago"],
    ["2026-07-23T12:00:00.000Z", "Created 2 months ago"],
    ["2025-09-23T12:00:00.000Z", "Created last year"],
    ["2023-09-23T12:00:00.000Z", "Created 3 years ago"]
  ])("formats %s as %s", (iso, expected) => {
    expect(formatCreatedRelative(iso, now)).toBe(expected);
  });

  it("rounds up to the next unit at a boundary instead of showing 60 seconds", () => {
    expect(formatCreatedRelative("2026-09-23T11:59:00.400Z", now)).toBe("Created 1 minute ago");
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatCreatedRelative("not a date", now)).toBeNull();
  });
});

describe("personInitials", () => {
  it("uses the first and last name initials", () => {
    expect(personInitials("Ravi Estimator")).toBe("RE");
    expect(personInitials("  divya  rao kapoor ")).toBe("DK");
    expect(personInitials("Priya")).toBe("P");
  });
});
