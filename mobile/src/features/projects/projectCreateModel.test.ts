import { splitStableIds, validBudgetRange, validSchedule } from "./projectCreateModel";

describe("project creation model", () => {
  it("deduplicates stable assignee IDs and keeps the initiating Designer", () => {
    expect(splitStableIds("user-b, user-a user-b", "user-a")).toEqual(["user-a", "user-b"]);
  });

  it("validates schedule ordering and budget ranges", () => {
    expect(validSchedule("2026-10-01", "2026-10-02")).toBe(true);
    expect(validSchedule("2026-10-03", "2026-10-02")).toBe(false);
    expect(validBudgetRange("0", "100000")).toBe(true);
    expect(validBudgetRange("100", "99")).toBe(false);
  });
});
