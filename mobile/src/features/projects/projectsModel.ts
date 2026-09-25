import { ApiProtocolError } from "../../core/http/apiClient";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "unknown";

export interface ProjectItem {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string | null;
  readonly status: ProjectStatus;
  readonly dateLabel: string | null;
}

export interface ProjectPage {
  readonly items: readonly ProjectItem[];
  readonly pagination: {
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    readonly hasMore: boolean;
  };
}

export const projectStatusLabels: Readonly<Record<ProjectStatus, string>> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  unknown: "Status unavailable"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function presentText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
});

function presentDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const calendarDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = dateFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("day")} ${part("month")} ${part("year")}`;
}

function presentProject(value: unknown): ProjectItem {
  if (!isRecord(value) || !presentText(value.id)) throw new ApiProtocolError();
  const status = value.status;
  const updated = presentDate(value.updatedAt);
  const created = presentDate(value.createdAt);
  return {
    id: value.id as string,
    name: presentText(value.name) ?? "Untitled project",
    subtitle: presentText(value.propertyType) ?? presentText(value.location),
    status: status === "planning" || status === "active" || status === "on_hold" || status === "completed" ? status : "unknown",
    dateLabel: updated ? `Updated ${updated}` : created ? `Created ${created}` : null
  };
}

/** Parses the data payload after the authenticated client unwraps the API envelope. */
export function parseProjectPage(value: unknown): ProjectPage {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination)) throw new ApiProtocolError();
  const { total, offset, limit, hasMore } = value.pagination;
  if (
    !count(total) || !count(offset) || !count(limit) || limit < 1 || limit > 100 ||
    !Number.isSafeInteger(offset + limit) || typeof hasMore !== "boolean" ||
    value.items.length > limit || value.items.length > total ||
    (hasMore && value.items.length === 0)
  ) throw new ApiProtocolError();
  return {
    items: value.items.map(presentProject),
    pagination: { total, offset, limit, hasMore }
  };
}

/** Later pages may overlap when the server list changes; retain stable order and the latest value. */
export function uniqueProjects(pages: readonly ProjectPage[]): readonly ProjectItem[] {
  const items = new Map<string, ProjectItem>();
  for (const page of pages) {
    for (const item of page.items) items.set(item.id, item);
  }
  return [...items.values()];
}

export function projectCounts(items: readonly ProjectItem[]): Readonly<Record<ProjectStatus | "total", number>> {
  const counts = { total: items.length, planning: 0, active: 0, on_hold: 0, completed: 0, unknown: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
