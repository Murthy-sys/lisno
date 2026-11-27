import { saveKnowledgeDrafts, rebaseKnowledgeDraft, nativeMarginEdits, type KnowledgeDrafts } from "./knowledgeWorkspaceDraft";
import type { KnowledgeSectionEnvelope, KnowledgeSectionMutationEnvelope } from "../../../../shared/knowledge/knowledgeTypes";

const section = (version: number, payload: KnowledgeSectionEnvelope["payload"]) => ({ version, payload, applicability: "configured" } as KnowledgeSectionEnvelope);

it.each([undefined, true, false])("preserves selection-needed metadata %s during an unrelated native Overview save", async selectionNeeded => {
  const payload = { uomId: "old-unit", ...(selectionNeeded === undefined ? {} : { selectionNeeded }) };
  const updateKnowledgeSection = jest.fn().mockResolvedValue({ aggregateVersion: 3 });
  await saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "line-a", revisionId: "rev-a", aggregateVersion: 2,
    drafts: { overview: { base: section(1, payload), payload: { ...payload, uomId: "new-unit" } } }, onSaved: jest.fn() });
  const savedPayload = updateKnowledgeSection.mock.calls[0][3].payload;
  expect(savedPayload).toEqual({ ...payload, uomId: "new-unit" });
  expect(Object.hasOwn(savedPayload, "selectionNeeded")).toBe(selectionNeeded !== undefined);
});

it.each([true, false])("keeps the latest selection-needed value %s when rebasing a native UOM edit", async selectionNeeded => {
  const base = section(1, { uomId: "old-unit", selectionNeeded: !selectionNeeded });
  const remote = section(2, { uomId: "old-unit", selectionNeeded });
  const rebased = rebaseKnowledgeDraft({ base, payload: { ...base.payload, uomId: "new-unit" } }, remote);
  const updateKnowledgeSection = jest.fn().mockResolvedValue({ aggregateVersion: 4 });
  await saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "line-a", revisionId: "rev-a", aggregateVersion: 3,
    drafts: { overview: rebased }, onSaved: jest.fn() });
  expect(updateKnowledgeSection).toHaveBeenCalledWith("line-a", "rev-a", "overview", expect.objectContaining({
    expectedVersion: 2, expectedAggregateVersion: 3, payload: { uomId: "new-unit", selectionNeeded }
  }));
});

it("preserves saved In-house policy and subset during an unrelated native Mode edit", async () => {
  const base = section(1, { inHouseUsage: "execution", inHousePresetComponentIds: ["chosen"], modeDescription: "Before" });
  const updateKnowledgeSection = jest.fn().mockResolvedValue({ aggregateVersion: 3 });
  await saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "line-a", revisionId: "rev-a", aggregateVersion: 2,
    drafts: { advanced: { base, payload: { ...base.payload, modeDescription: "After" } } }, onSaved: jest.fn() });
  expect(updateKnowledgeSection).toHaveBeenCalledWith("line-a", "rev-a", "advanced", expect.objectContaining({
    marginEdits: [], payload: { inHouseUsage: "execution", inHousePresetComponentIds: ["chosen"], modeDescription: "After" }
  }));
});

it("keeps authored fields through conflict review, deduplicates edits and omits reverted generated defaults", async () => {
  const base = section(2, { pmcMarginBps: 1600 });
  const pmc = { mode: "pmc", key: "margin", bound: "maximumBps" } as const;
  const gross = { mode: "in_house", key: "labor", bound: "minimumBps", component: { basketId: "basket-a", subBasketId: "sub-a" } } as const;
  const draft = { base, marginEdits: nativeMarginEdits([pmc, gross], pmc), payload: { pmcMarginBps: 1800,
    modeCalculations: { in_house_labor: { baseRatePaise: 2000, lowQuantityLimit: "15", impactBps: 1000, minimumMarkupBps: 2500, startingMarkupBps: 3500 } } } };
  const reviewed = rebaseKnowledgeDraft(draft, section(3, { pmcMarginBps: 1700 }));
  const updateKnowledgeSection = jest.fn().mockResolvedValue({ aggregateVersion: 5 });
  await saveKnowledgeDrafts({ api: { updateKnowledgeSection }, mainLineId: "line-a", revisionId: "rev-a", aggregateVersion: 4,
    drafts: { advanced: reviewed }, onSaved: jest.fn() });
  expect(updateKnowledgeSection.mock.calls[0][3]).toMatchObject({ expectedVersion: 3, marginEdits: [pmc] });
});

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
