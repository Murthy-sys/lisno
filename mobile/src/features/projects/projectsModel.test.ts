import { ApiProtocolError } from "../../core/http/apiClient";
import { parseProjectPage, projectCounts, projectStatusLabels, uniqueProjects } from "./projectsModel";

function page(items: readonly unknown[], pagination = {}) {
  return { items, pagination: { total: items.length, offset: 0, limit: 30, hasMore: false, ...pagination } };
}

describe("Projects presentation model", () => {
  it("preserves stable IDs and explicit source metadata without deriving phases or images", () => {
    const result = parseProjectPage(page([
      { id: "villa/a", name: "  Villa  ", propertyType: "Residential", location: "Bengaluru", status: "active", progress: 77, image: "untrusted", updatedAt: "2026-09-22T23:45:00.000Z", createdAt: "2026-07-01T00:00:00.000Z" },
      { id: "villa-b", name: "Villa", location: "Mumbai", status: "planning", createdAt: "2026-08-02T00:00:00.000Z" }
    ]));
    expect(result.items).toEqual([
      { id: "villa/a", name: "Villa", subtitle: "Residential", status: "active", dateLabel: "Updated 22 Sep 2026" },
      { id: "villa-b", name: "Villa", subtitle: "Mumbai", status: "planning", dateLabel: "Created 02 Aug 2026" }
    ]);
  });

  it("keeps unknown fields unavailable and falls back only to valid created dates", () => {
    expect(parseProjectPage(page([
      { id: "a", name: " ", propertyType: " ", location: null, status: "future_status", updatedAt: "2026-02-30T00:00:00.000Z", createdAt: "2026-09-21" },
      { id: "b", name: null, status: null, updatedAt: "yesterday", createdAt: "2026-13-02" },
      { id: "c", location: "Pune", updatedAt: 0, createdAt: false }
    ])).items).toEqual([
      { id: "a", name: "Untitled project", subtitle: null, status: "unknown", dateLabel: "Created 21 Sep 2026" },
      { id: "b", name: "Untitled project", subtitle: null, status: "unknown", dateLabel: null },
      { id: "c", name: "Untitled project", subtitle: "Pune", status: "unknown", dateLabel: null }
    ]);
    expect(projectStatusLabels.unknown).toBe("Status unavailable");
  });

  it("formats source timestamps in UTC independently of the device timezone", () => {
    expect(parseProjectPage(page([{ id: "a", updatedAt: "2026-09-22T01:00:00+05:30" }])).items[0]?.dateLabel)
      .toBe("Updated 21 Sep 2026");
  });

  it("counts asymmetric lifecycle states, unknown values and genuine zeroes", () => {
    const items = parseProjectPage(page([
      { id: "a", status: "active" }, { id: "b", status: "active" }, { id: "c", status: "planning" },
      { id: "d", status: "on_hold" }, { id: "e", status: "on_hold" }, { id: "f", status: "on_hold" }, { id: "g", status: "archived" }
    ])).items;
    expect(projectCounts(items)).toEqual({ total: 7, active: 2, planning: 1, on_hold: 3, completed: 0, unknown: 1 });
    expect(projectCounts([])).toEqual({ total: 0, active: 0, planning: 0, on_hold: 0, completed: 0, unknown: 0 });
  });

  it("deduplicates overlapping pages by ID while preserving order and latest metadata", () => {
    const first = parseProjectPage(page([{ id: "a", name: "Villa", status: "planning" }, { id: "b", name: "Villa", status: "active" }], { total: 3, limit: 2, hasMore: true }));
    const second = parseProjectPage(page([{ id: "b", name: "Renamed villa", status: "completed" }, { id: "c", name: "Villa", status: "on_hold" }], { total: 3, limit: 2, offset: 2 }));
    const result = uniqueProjects([first, second]);
    expect(result.map(({ id, name, status }) => ({ id, name, status }))).toEqual([
      { id: "a", name: "Villa", status: "planning" },
      { id: "b", name: "Renamed villa", status: "completed" },
      { id: "c", name: "Villa", status: "on_hold" }
    ]);
    expect(projectCounts(result).total).toBe(3);
    expect(first.items[1]?.name).toBe("Villa");
    expect(uniqueProjects([])).toEqual([]);
  });

  it.each([
    null, [], {}, { items: [], pagination: null },
    page([{}]), page([{ id: 123 }]), page([{ id: "  " }]),
    page([], { total: -1 }), page([], { total: "0" }), page([], { total: Number.MAX_SAFE_INTEGER + 1 }),
    page([], { offset: -1 }), page([], { offset: 0.5 }), page([], { limit: 0 }), page([], { limit: 101 }),
    page([], { hasMore: 1 }), page([], { hasMore: true, total: 3 }),
    page([{ id: "a" }], { total: 0 }), page([{ id: "a" }, { id: "b" }], { limit: 1 })
  ])("rejects malformed project identities and pagination: %j", (input) => {
    expect(() => parseProjectPage(input)).toThrow(ApiProtocolError);
  });

  it("accepts an empty authoritative page without creating placeholder projects", () => {
    expect(parseProjectPage(page([]))).toEqual(page([]));
  });
});
