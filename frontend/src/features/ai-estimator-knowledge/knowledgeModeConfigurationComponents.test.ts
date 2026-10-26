import { describe, expect, it } from "vitest";
import { currentModeConfigurationIssues, retainObsoleteInHouseScope } from "./knowledgeModeConfiguration";
const conflict = [{ id: "scope", name: "Painting", selected: true }];
const old = { id: "old", modeKind: "execution", executionSource: "in_house", fields: [], inclusions: conflict, exclusions: conflict };
describe("component-owned scope validation", () => {
  it("ignores only obsolete checklists while preserving their raw values", () => {
    const payload = { inHouseComponents: [], modeConfigurations: [old] };
    expect(currentModeConfigurationIssues(payload)).toEqual([]);
    expect(currentModeConfigurationIssues({ modeConfigurations: [old] })).toHaveLength(2);
    expect(retainObsoleteInHouseScope(payload, { ...payload, modeConfigurations: [{ ...old, inclusions: [], exclusions: [] }] })).toEqual(payload);
    expect(retainObsoleteInHouseScope(payload, { ...payload, modeConfigurations: [] }).modeConfigurations).toEqual([]);
  });
  it("keeps structural, field, and other mode validation when a preceding record is malformed", () => {
    const issues = currentModeConfigurationIssues({ inHouseComponents: [], modeConfigurations: [null,
      { ...old, inclusions: "malformed obsolete list", fields: [{ id: "bad", type: "unsupported", label: "Bad field", options: [], value: null }] },
      { id: "pmc", modeKind: "pmc", fields: [], inclusions: conflict, exclusions: conflict }
    ] });
    expect(issues).toContainEqual({ path: "modeConfigurations.0", message: "Mode configuration must be an object." });
    expect(issues.some(({ path }) => path === "modeConfigurations.1.fields.0.type")).toBe(true);
    expect(issues.filter(({ message }) => message.includes("selected in both lists"))).toHaveLength(2);
    expect(issues.some(({ message }) => message.includes("must be a list") && message.includes("Inclusion"))).toBe(false);
  });
});
