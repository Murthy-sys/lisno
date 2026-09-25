import { saveKnowledgeDrafts, rebaseKnowledgeDraft, type KnowledgeDrafts } from "./knowledgeWorkspaceDraft";
import type { KnowledgeSectionEnvelope, KnowledgeSectionMutationEnvelope } from "../../../../shared/knowledge/knowledgeTypes";

const section = (version: number, payload: KnowledgeSectionEnvelope["payload"]) => ({ version, payload, applicability: "configured" } as KnowledgeSectionEnvelope);

it("saves Mode sections in order with each acknowledged aggregate version", async () => {
  const updateKnowledgeSection = jest.fn()
    .mockResolvedValueOnce({ aggregateVersion: 12 } as KnowledgeSectionMutationEnvelope)
    .mockResolvedValueOnce({ aggregateVersion: 13 } as KnowledgeSectionMutationEnvelope);
  const saved = jest.fn();
  const drafts: KnowledgeDrafts = {
    advanced: { base: section(4, {}), payload: { retained: "scope" } },
    pricing: { base: section(7, {}), payload: { specifications: [{ id: "spec-a", name: "Oak" }] } }
  };
  expect(await saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "line-a", revisionId: "rev-a", aggregateVersion: 11, drafts, onSaved: saved })).toBe(13);
  expect(updateKnowledgeSection.mock.calls.map(call => [call[2], call[3].expectedVersion, call[3].expectedAggregateVersion])).toEqual([["advanced", 4, 11], ["pricing", 7, 12]]);
  expect(saved.mock.calls.map(call => call[0])).toEqual(["advanced", "pricing"]);
});

it("acknowledges the first successful write before retaining a failed later section", async () => {
  const updateKnowledgeSection = jest.fn().mockResolvedValueOnce({ aggregateVersion: 12 }).mockRejectedValueOnce(new Error("Offline"));
  const saved = jest.fn();
  await expect(saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "a", revisionId: "r", aggregateVersion: 11,
    drafts: { advanced: { base: section(4, {}), payload: { modeDescription: "New" } }, pricing: { base: section(7, {}), payload: { specifications: [] } } }, onSaved: saved
  })).rejects.toThrow("Offline");
  expect(saved).toHaveBeenCalledTimes(1);
  expect(saved).toHaveBeenCalledWith("advanced", { aggregateVersion: 12 });
  expect(updateKnowledgeSection).toHaveBeenCalledTimes(2);
});

it("rebases only locally changed fields while preserving concurrent remote fields", () => {
  const rebased = rebaseKnowledgeDraft({ base: section(1, { uomId: "old", surfaceIds: ["old-surface"], removed: "old" }), payload: { uomId: "chosen", surfaceIds: ["old-surface"] } }, section(3, { uomId: "remote", surfaceIds: ["new-surface"], removed: "remote", futureField: "keep" }));
  expect(rebased).toEqual({ base: section(3, { uomId: "remote", surfaceIds: ["new-surface"], removed: "remote", futureField: "keep" }), payload: { uomId: "chosen", surfaceIds: ["new-surface"], futureField: "keep" } });
});

it.each([
  ["overview", { surfaceIds: ["ceiling"] }, "configured"],
  ["overview", { uomId: "area" }, "not_applicable"],
  ["advanced", { modeCalculations: { pmc: { baseRatePaise: 22000 } } }, "configured"],
  ["pricing", { specifications: [] }, "not_applicable"]
] as const)("matches frontend applicability transitions for %s edits", async (key, payload, applicability) => {
  const updateKnowledgeSection = jest.fn().mockResolvedValue({ aggregateVersion: 2 });
  await saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "a", revisionId: "r", aggregateVersion: 1, drafts: { [key]: { base: { ...section(1, {}), applicability: "not_applicable" }, payload } }, onSaved: jest.fn() });
  expect(updateKnowledgeSection).toHaveBeenCalledWith("a", "r", key, expect.objectContaining({ applicability }));
});
