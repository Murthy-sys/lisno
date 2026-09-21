import { dashboardMetrics, extractRecords, recordFields, recordId, recordTitle } from "./recordPresentation";

describe("native record presentation", () => {
  it("extracts paginated records while retaining stable IDs", () => {
    const records = extractRecords({ items: [{ id: "one", name: "Project One" }] });
    expect(recordId(records[0]!)).toBe("one");
    expect(recordTitle(records[0]!, 0)).toBe("Project One");
  });

  it("does not render secret-like fields", () => {
    expect(recordFields({ id: "one", token: "raw", passwordHash: "hash", status: "active" }).map((field) => field.key)).toEqual(["id", "status"]);
  });

  it("uses nested project identity for conversation rows", () => {
    const conversation = { project: { id: "project-one", name: "Courtyard residence" } };
    expect(recordId(conversation)).toBe("project-one");
    expect(recordTitle(conversation, 0)).toBe("Courtyard residence");
  });

  it("presents backend dashboard primitives without inventing totals", () => {
    expect(dashboardMetrics({ activeProjects: 8, delayedProjects: 2 }).map((field) => field.value)).toEqual(["8", "2"]);
  });
});
