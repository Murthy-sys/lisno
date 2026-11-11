export type InHouseUsage = "estimator" | "execution";
export interface InHouseUsagePolicy {
  state: "legacy" | "ready" | "incomplete" | "invalid";
  usage: InHouseUsage | null;
  componentIds: string[];
  issues: Array<{ path: string; message: string }>;
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value;

/** Read the exact scope's payload. Missing fields are legacy; malformed explicit policy never is. */
export function readInHouseUsagePolicy(payload: unknown): InHouseUsagePolicy {
  const row = record(payload);
  if (!Object.hasOwn(row, "inHouseUsage") && !Object.hasOwn(row, "inHousePresetComponentIds")) {
    return { state: "legacy", usage: null, componentIds: [], issues: [] };
  }
  const issues: InHouseUsagePolicy["issues"] = [];
  const usage = row.inHouseUsage === "estimator" || row.inHouseUsage === "execution" ? row.inHouseUsage : null;
  if (!usage) issues.push({ path: "inHouseUsage", message: "Choose Estimator or Execution for In-house use." });
  const ids = row.inHousePresetComponentIds;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(validId) || new Set(ids).size !== ids.length) {
    issues.push({ path: "inHousePresetComponentIds", message: "Include up to 50 distinct configured components in the price." });
  }
  const componentIds = Array.isArray(ids) && ids.every(validId) ? [...ids] : [];
  const components = Array.isArray(row.inHouseComponents) ? row.inHouseComponents.map(record) : [];
  const availableIds = new Set(components.map(component => component.id));
  if (componentIds.some(id => !availableIds.has(id)) || availableIds.size !== components.length) {
    issues.push({ path: "inHousePresetComponentIds", message: "Included components must belong to this Main Line and Mode scope." });
  }
  return { state: issues.length ? "invalid" : componentIds.length ? "ready" : "incomplete", usage, componentIds, issues };
}
