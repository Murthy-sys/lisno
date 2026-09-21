const ITEM_KEYS = [
  "items",
  "projects",
  "tasks",
  "users",
  "conversations",
  "notifications",
  "managers",
  "designers",
  "results",
  "entries",
  "rounds"
] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractRecords(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ITEM_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

function text(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function recordId(record: Record<string, unknown>): string | null {
  const direct = text(record, ["id", "projectId", "taskId", "leadId", "userId", "roundId", "mainLineId", "notificationId", "conversationId"]);
  if (direct) return direct;
  const projectId = isRecord(record.project) ? text(record.project, ["id", "projectId"]) : null;
  if (projectId) return projectId;
  return isRecord(record.user) ? text(record.user, ["id", "userId"]) : null;
}

export function recordTitle(record: Record<string, unknown>, index: number): string {
  const direct = text(record, ["name", "title", "projectName", "leadName", "subject", "displayName", "clientName", "email", "label", "messagePreview"]);
  if (direct) return direct;
  const nestedProject = isRecord(record.project) ? text(record.project, ["name", "title"]) : null;
  const nestedLead = isRecord(record.lead) ? text(record.lead, ["projectName", "clientName"]) : null;
  const nestedUser = isRecord(record.user) ? text(record.user, ["name", "displayName", "email"]) : null;
  return nestedProject ?? nestedLead ?? nestedUser ?? `Record ${index + 1}`;
}

export function recordSubtitle(record: Record<string, unknown>): string | null {
  const values = [
    text(record, ["status", "state", "stage", "roleLabel", "role"]),
    text(record, ["clientName", "projectName", "email", "assigneeName", "managerName"])
  ].filter((value): value is string => Boolean(value));
  return values.length ? [...new Set(values)].join(" · ") : null;
}

function safePrimitive(key: string, value: unknown): string | null {
  if (/token|password|secret|authorization|privateurl/iu.test(key)) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null) return "Unavailable";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  return null;
}

export interface PresentedField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export function recordFields(record: Record<string, unknown>, limit = 28): readonly PresentedField[] {
  const fields: PresentedField[] = [];
  for (const [key, rawValue] of Object.entries(record)) {
    const value = safePrimitive(key, rawValue);
    if (!value) continue;
    fields.push({
      key,
      label: key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./u, (letter) => letter.toUpperCase()),
      value
    });
    if (fields.length >= limit) break;
  }
  return fields;
}

export function dashboardMetrics(value: unknown): readonly PresentedField[] {
  if (!isRecord(value)) return [];
  return recordFields(value, 16).filter((field) => !/id$/iu.test(field.key));
}
