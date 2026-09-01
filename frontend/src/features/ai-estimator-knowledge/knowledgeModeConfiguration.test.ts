import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_EXECUTION_SOURCE_OPTIONS,
  KNOWLEDGE_MODE_OPTIONS,
  parseKnowledgeModeConfigurations,
  partitionKnowledgeModeConfigurations,
  projectKnowledgeModeFieldSummaries,
  resolveLegacyKnowledgeModeKind,
  validateKnowledgeModeConfigurations,
  withKnowledgeModeConfigurations,
  type KnowledgeModeConfiguration
} from "./knowledgeModeConfiguration";
import type { KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

const metadata = {
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z"
} as const;

function master(id: string, code: string, name: string): KnowledgeMaster {
  return {
    id,
    masterType: "modes",
    code,
    name,
    description: null,
    displayOrder: 10,
    status: "active",
    version: 1,
    ...metadata
  };
}

const configurations: readonly KnowledgeModeConfiguration[] = [
  {
    id: "configuration-pmc",
    modeKind: "pmc",
    executionSource: null,
    legacyModeId: null,
    fields: [
      { id: "field-pmc-mark", type: "text", label: "PMC mark", options: [] }
    ]
  },
  {
    id: "configuration-sub-vendor",
    modeKind: "execution",
    executionSource: "sub_vendor",
    legacyModeId: null,
    fields: [{
      id: "field-work-package",
      type: "dropdown",
      label: "Work package",
      options: ["Carpentry", "Electrical"]
    }]
  },
  {
    id: "configuration-in-house",
    modeKind: "execution",
    executionSource: "in_house",
    legacyModeId: null,
    fields: [{
      id: "field-crew-size",
      type: "number",
      label: "Crew size",
      options: []
    }]
  }
];

describe("Mode component definition contract", () => {
  it("exposes fixed Mode and Execution source choices", () => {
    expect(KNOWLEDGE_MODE_OPTIONS).toEqual([
      { modeKind: "pmc", label: "PMC" },
      { modeKind: "execution", label: "Execution" }
    ]);
    expect(KNOWLEDGE_EXECUTION_SOURCE_OPTIONS).toEqual([
      { executionSource: "sub_vendor", label: "Sub-Vendor" },
      { executionSource: "in_house", label: "In-house" }
    ]);
  });

  it("round-trips three canonical definition buffers and preserves unrelated Advanced keys", () => {
    const advanced: KnowledgeJsonObject = {
      dependencies: [{ id: "dependency-stable", targetMainLineId: "line-related" }],
      modeOverrides: [{ id: "override-stable", modeId: "historical-mode-id", active: true }],
      serverOwnedExtension: { keep: "exactly" }
    };

    const next = withKnowledgeModeConfigurations(advanced, configurations);

    expect(next).toMatchObject(advanced);
    expect(next.modeConfigurations).toEqual([
      {
        id: "configuration-pmc",
        modeKind: "pmc",
        fields: [{ id: "field-pmc-mark", type: "text", label: "PMC mark", options: [] }]
      },
      {
        id: "configuration-sub-vendor",
        modeKind: "execution",
        executionSource: "sub_vendor",
        fields: [{
          id: "field-work-package",
          type: "dropdown",
          label: "Work package",
          options: ["Carpentry", "Electrical"]
        }]
      },
      {
        id: "configuration-in-house",
        modeKind: "execution",
        executionSource: "in_house",
        fields: [{ id: "field-crew-size", type: "number", label: "Crew size", options: [] }]
      }
    ]);
    expect(JSON.stringify(next.modeConfigurations)).not.toContain("value");
    expect(parseKnowledgeModeConfigurations(next.modeConfigurations)).toEqual({
      configurations,
      issues: []
    });
  });

  it("parses historical values as hidden compatibility state and never serializes them", () => {
    const raw: KnowledgeJsonObject = {
      modeConfigurations: [{
        id: "configuration-pmc",
        modeKind: "pmc",
        fields: [{
          id: "field-pmc-mark",
          type: "text",
          label: "PMC mark",
          options: [],
          value: "A1"
        }]
      }]
    };
    const parsed = parseKnowledgeModeConfigurations(raw.modeConfigurations);

    expect(parsed.issues).toEqual([]);
    expect(parsed.configurations[0]?.fields[0]).toMatchObject({
      id: "field-pmc-mark",
      legacyValue: "A1"
    });
    const serialized = withKnowledgeModeConfigurations(raw, parsed.configurations);
    expect(serialized.modeConfigurations).toEqual([{
      id: "configuration-pmc",
      modeKind: "pmc",
      fields: [{
        id: "field-pmc-mark",
        type: "text",
        label: "PMC mark",
        options: []
      }]
    }]);
    expect(JSON.stringify(serialized.modeConfigurations)).not.toContain("A1");
  });

  it("partitions PMC, Sub-Vendor, and In-house without source crossover", () => {
    const partitioned = partitionKnowledgeModeConfigurations(configurations);

    expect(partitioned.primary.pmc?.id).toBe("configuration-pmc");
    expect(partitioned.primary.execution.sub_vendor?.id)
      .toBe("configuration-sub-vendor");
    expect(partitioned.primary.execution.in_house?.id)
      .toBe("configuration-in-house");
    expect(partitioned.recovery).toEqual([]);
  });

  it("keeps reusable-ID and unscoped Execution rows in explicit recovery", () => {
    const execution = master("legacy-execution-id", "EXECUTION", "Legacy execution");
    const parsed = parseKnowledgeModeConfigurations([
      {
        id: "legacy-execution",
        modeId: execution.id,
        fields: [{ id: "legacy-field", type: "text", label: "Legacy scope", options: [], value: "Hidden" }]
      },
      {
        id: "unscoped-execution",
        modeKind: "execution",
        fields: [{ id: "unscoped-field", type: "text", label: "Unscoped scope", options: [] }]
      }
    ], [execution]);
    const partitioned = partitionKnowledgeModeConfigurations(parsed.configurations);

    expect(partitioned.primary.execution).toEqual({});
    expect(partitioned.recovery).toEqual([
      expect.objectContaining({
        reason: "legacy_reference",
        modeKind: "execution"
      }),
      expect.objectContaining({
        reason: "unscoped_execution",
        modeKind: "execution"
      })
    ]);
  });

  it("resolves legacy IDs only from one active canonical-code record", () => {
    const pmc = master("mode-pmc-asymmetric-id", "ＰＭＣ", "Project management");
    const execution = master("mode-execution-asymmetric-id", "EXECUTION", "Delivery");
    expect(resolveLegacyKnowledgeModeKind(pmc.id, [pmc, execution])).toBe("pmc");
    expect(resolveLegacyKnowledgeModeKind(execution.id, [pmc, execution])).toBe("execution");
    expect(resolveLegacyKnowledgeModeKind(pmc.id, [])).toBeNull();
    expect(resolveLegacyKnowledgeModeKind(pmc.id, [
      pmc,
      master("duplicate", "PMC", "Duplicate")
    ])).toBeNull();
  });

  it("validates source identity, normalized labels, and choice options per buffer", () => {
    const issues = validateKnowledgeModeConfigurations([
      {
        id: "configuration-sub-vendor-1",
        modeKind: "execution",
        executionSource: "sub_vendor",
        legacyModeId: null,
        fields: [
          { id: "field-1", type: "text", label: "Work  package", options: [] },
          { id: "field-2", type: "radio", label: "Ｗork package", options: ["Phase  One", "phase one"] }
        ]
      },
      {
        id: "configuration-sub-vendor-2",
        modeKind: "execution",
        executionSource: "sub_vendor",
        legacyModeId: null,
        fields: []
      }
    ]);

    expect(issues.map(({ message }) => message)).toEqual(expect.arrayContaining([
      "Component labels must be unique within this configuration.",
      "Allowed options must be unique.",
      "Each Execution source can have only one configuration."
    ]));
  });

  it("projects definition metadata only for the exact requested Mode/source", () => {
    expect(projectKnowledgeModeFieldSummaries(configurations, "pmc")).toEqual([{
      id: "field-pmc-mark",
      label: "PMC mark",
      type: "text",
      options: []
    }]);
    expect(projectKnowledgeModeFieldSummaries(
      configurations,
      "execution",
      "sub_vendor"
    )).toEqual([{
      id: "field-work-package",
      label: "Work package",
      type: "dropdown",
      options: ["Carpentry", "Electrical"]
    }]);
    expect(projectKnowledgeModeFieldSummaries(
      configurations,
      "execution",
      "in_house"
    )).toEqual([{
      id: "field-crew-size",
      label: "Crew size",
      type: "number",
      options: []
    }]);
    expect(JSON.stringify(projectKnowledgeModeFieldSummaries(
      configurations,
      "execution",
      "sub_vendor"
    ))).not.toContain("value");
  });

  it("flags invalid canonical source combinations without assigning them", () => {
    const parsed = parseKnowledgeModeConfigurations([
      {
        id: "pmc-with-source",
        modeKind: "pmc",
        executionSource: "sub_vendor",
        fields: []
      },
      {
        id: "execution-invalid-source",
        modeKind: "execution",
        executionSource: "external",
        fields: []
      }
    ]);

    expect(parsed.issues.map(({ message }) => message)).toEqual(expect.arrayContaining([
      "PMC must not contain an Execution source.",
      "Execution source must be Sub-Vendor or In-house."
    ]));
    expect(partitionKnowledgeModeConfigurations(parsed.configurations).primary.execution)
      .toEqual({});
  });
});
