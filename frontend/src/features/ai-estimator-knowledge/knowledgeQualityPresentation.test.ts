import { describe, expect, it } from "vitest";
import { QUALITY_TYPE_LABELS, qualityEvidenceSummary, qualityStage, qualityStageCounts } from "./knowledgeQualityPresentation";
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
});
