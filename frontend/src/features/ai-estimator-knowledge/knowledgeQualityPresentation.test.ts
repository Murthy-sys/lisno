import { describe, expect, it } from "vitest";
import { QUALITY_TYPE_LABELS, qualityEvidenceSummary, qualityFrequencyPresentation, qualityPassRange, qualityPerformerPresentation, qualitySeverityPresentation, qualityStage, qualityStageCounts } from "./knowledgeQualityPresentation";
import type { KnowledgeJsonObject } from "./knowledgeTypes";
import { QUALITY_PARAMETER_TYPES } from "./knowledgeQuality";

describe("quality table presentation", () => {
  it("classifies canonical spellings without modifying legacy or unset stages", () => {
    expect(qualityStage("  Pre_Installation ")).toEqual({ key: "pre-installation", label: "Pre-Installation" });
    expect(qualityStage("During Installation")).toEqual({ key: "during-installation", label: "During Installation" });
    expect(qualityStage("Before closing")).toEqual({ key: "other", label: "Before closing" });
    expect(qualityStage(null)).toEqual({ key: "unassigned", label: "Unassigned" });
    const rows: KnowledgeJsonObject[] = [{ stage: "Material" }, { stage: "final_finish" }, { stage: "Before closing" }, {}];
    expect(qualityStageCounts(rows)).toMatchObject({ all: 4, material: 1, "final-finish": 1, other: 1, unassigned: 1 });
    expect(rows[1]?.stage).toBe("final_finish");
  });
  it("distinguishes every answer type and describes only stored evidence", () => {
    expect(Object.keys(QUALITY_TYPE_LABELS).sort()).toEqual([...QUALITY_PARAMETER_TYPES].sort());
    expect(qualityEvidenceSummary({})).toBe("Not required");
    expect(qualityEvidenceSummary({ evidence: { photos: true, minPhotosPerSample: 100, documents: true, video: true } })).toBe("100 photos per checked unit + Documents + Video");
    expect(qualityEvidenceSummary({ evidence: { photos: true, minPhotosPerSample: 101 } })).toBe("Photo count needed");
    expect(qualityEvidenceSummary({ evidence: { photos: false, minPhotosPerSample: 3 } })).toBe("Not required");
  });
  it("presents canonical controls and readable legacy values without raw codes", () => {
    expect(qualitySeverityPresentation("critical")).toEqual({ label: "Critical", meaning: "Blocking; PM sign-off policy applies.", canonical: true });
    expect(qualityPerformerPresentation("pm")).toEqual({ label: "PM", canonical: true });
    expect(qualityPerformerPresentation("Site engineer")).toEqual({ label: "Legacy responsible role: Site engineer", canonical: false });
    expect(qualityFrequencyPresentation({ method: "fixed_count", value: 1, unit: "project" })).toMatchObject({ label: "Once per project", scopeLabel: "project", canonical: true });
    expect(qualityFrequencyPresentation({ method: "percentage", value: 10, unit: "rooms" }).label).toBe("Legacy custom frequency: percentage 10 · rooms");
    expect(qualityPassRange({ type: "number", minimum: "0.25", maximum: "1.5", unit: "mm" })).toBe("0.25–1.5 mm");
    expect(qualityEvidenceSummary({ sampling: { method: "all", unit: "room" }, evidence: { photos: true, minPhotosPerSample: 2 } })).toBe("2 photos per checked room");
  });

  it("resolves reusable control labels everywhere and never exposes an unavailable reference", () => {
    const frequencyId = "qco_111111111111111111111111";
    const performerId = "qco_222222222222222222222222";
    const catalog = {
      frequency: [{ id: frequencyId, kind: "frequency", name: "Per elevation", version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }],
      performer: [{ id: performerId, kind: "performer", name: "Quality lead", version: 1, createdById: "user-1", updatedById: "user-1", createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z" }]
    } as const;
    expect(qualityFrequencyPresentation({ method: "all", unit: frequencyId }, catalog)).toEqual({ label: "Per elevation", scopeLabel: "Per elevation", canonical: true });
    expect(qualityPerformerPresentation(performerId, catalog)).toEqual({ label: "Quality lead", canonical: true });
    expect(qualityEvidenceSummary({ sampling: { method: "all", unit: frequencyId }, evidence: { photos: true, minPhotosPerSample: 2 } }, catalog)).toBe("2 photos per checked Per elevation");

    const unavailableFrequency = qualityFrequencyPresentation({ method: "all", unit: "qco_333333333333333333333333" }, catalog);
    const unavailablePerformer = qualityPerformerPresentation("qco_444444444444444444444444", catalog);
    expect(unavailableFrequency).toMatchObject({ label: "Unavailable frequency value", canonical: false });
    expect(unavailablePerformer).toEqual({ label: "Unavailable performed-by value", canonical: false });
    expect(JSON.stringify([unavailableFrequency, unavailablePerformer])).not.toContain("qco_");
  });
});
