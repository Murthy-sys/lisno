import { describe, expect, it } from "vitest";

import { buildConfiguredLines } from "./configuredEstimate";
import type { EstimationCatalogue, EstimationCatalogueRecommendations, EstimationRecommendationRule } from "./estimationCatalogueApi";
import { buildRoomRecommendations, partitionRoomRecommendationSources, recommendationLines,
  recommendationSourceIdentity, recommendationTargetIdentity, type RecommendationDecision } from "./roomRecommendations";

const uom = { id: "uom-sqft", code: "SQFT", name: "sq ft", decimalScale: 2 };
const catalogue: EstimationCatalogue = { ineligibleLineCount: 0, items: [
  { id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, subBaskets: [{ id: "sub-ceiling", basketId: "basket-pop", name: "False Ceiling", displayOrder: 1, mainLines: [
    { id: "line-pop", mainLineId: "line-pop", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "POP false ceiling", displayOrder: 1, revisionId: "rev-pop", revisionVersion: 2, itemVersion: 3, uom },
    { id: "line-functional", mainLineId: "line-functional", basketId: "basket-pop", subBasketId: "sub-ceiling", name: "Functional Lights", displayOrder: 2, revisionId: "rev-functional", revisionVersion: 1, itemVersion: 1, uom }
  ] }] },
  { id: "basket-paint", name: "Painting", displayOrder: 2, subBaskets: [{ id: "sub-paint", basketId: "basket-paint", name: "Ceiling finish", displayOrder: 1, mainLines: [
    { id: "line-paint", mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint", name: "False ceiling painting", displayOrder: 1, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1, uom }
  ], temporaryItems: [{ id: "line-accent", mainLineId: "line-accent", itemType: "temporary", basketId: "basket-paint", subBasketId: "sub-paint", name: "Accent finish", displayOrder: 2, revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1, uom }] }] },
  { id: "basket-duplicate", name: "Other finish", displayOrder: 3, subBaskets: [{ id: "sub-other", basketId: "basket-duplicate", name: "Other", displayOrder: 1, mainLines: [
    { id: "line-same-name", mainLineId: "line-same-name", basketId: "basket-duplicate", subBasketId: "sub-other", name: "False ceiling painting", displayOrder: 1, revisionId: "rev-other", revisionVersion: 1, itemVersion: 1, uom }
  ] }] }
] };
const rooms = [{ id: "room-one", label: "Living room" }, { id: "room-two", label: "Bedroom" }];
const sourceLines = buildConfiguredLines(catalogue, rooms, new Set(["basket-pop", "basket-paint"]), []).map((line) => ({
  ...line,
  included: line.roomId === "room-one" && (line.mainLineId === "line-pop" || line.mainLineId === "line-functional") ||
    line.roomId === "room-two" && line.mainLineId === "line-paint"
}));

function rule(overrides: Partial<EstimationRecommendationRule> = {}): EstimationRecommendationRule {
  return { id: "rule-paint", requirement: "can", reason: "Painting completes the false ceiling surface.", targetKind: "main_line",
    targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: "line-paint",
    targetRevisionId: "rev-paint", targetRevisionVersion: 1, targetItemVersion: 1,
    available: true, completionRequired: false, ...overrides };
}

const recommendations: EstimationCatalogueRecommendations = { sources: [
  { mainLineId: "line-pop", available: true, revisionId: "rev-pop", revisionVersion: 2, itemVersion: 3,
    rules: [rule()], guidance: [{ id: "guide-1", name: "Check substrate", reason: "Confirm that the slab is dry." }] },
  { mainLineId: "line-functional", available: true, revisionId: "rev-functional", revisionVersion: 1, itemVersion: 1,
    rules: [rule({ id: "rule-paint-required", requirement: "must", reason: "Finish around the light openings." })], guidance: [] }
] };

describe("room recommendations", () => {
  it("flattens direct and group targets once with stable location identity and required precedence", () => {
    const direct = buildRoomRecommendations({ catalogue, lines: sourceLines, roomId: "room-one", recommendations }).decisions[0]!;
    const optional: RecommendationDecision = { ...direct, requirement: "can", reasons: [direct.reasons[0]!] };
    const group: RecommendationDecision = {
      ...direct, key: "sub-basket:basket-paint:sub-paint", kind: "sub_basket", target: null,
      reasons: [direct.reasons[1]!], children: [
        { target: direct.target!, name: direct.name, selected: false, completionRequired: false },
        { target: { mainLineId: "line-accent", basketId: "basket-paint", subBasketId: "sub-paint" },
          name: "Accent finish", selected: true, completionRequired: true }
      ]
    };
    const before = structuredClone([optional, group]);
    for (const decisions of [[optional, group, optional], [group, optional]]) {
      const lines = recommendationLines(decisions);
      expect(lines).toHaveLength(2);
      const shared = lines.find((line) => line.target.mainLineId === "line-paint")!;
      expect(shared).toMatchObject({ key: recommendationTargetIdentity(direct.target!), requirement: "must", selected: false });
      expect(shared.reasons).toHaveLength(2);
      expect(new Set(shared.reasons.map((reason) => reason.sourceId))).toEqual(new Set(["line-pop", "line-functional"]));
      expect(lines.find((line) => line.target.mainLineId === "line-accent")).toMatchObject({ selected: true, requirement: "must" });
    }
    expect([optional, group]).toEqual(before);
  });

  it("keeps equal names at different stable targets separate and excludes unavailable targets", () => {
    const direct = buildRoomRecommendations({ catalogue, lines: sourceLines, roomId: "room-one", recommendations }).decisions[0]!;
    const sameName: RecommendationDecision = { ...direct, key: "line:line-same-name", requirement: "can",
      target: { mainLineId: "line-same-name", basketId: "basket-duplicate", subBasketId: "sub-other" } };
    const otherLocation: RecommendationDecision = { ...sameName, key: "line:other-location",
      target: { ...sameName.target!, subBasketId: null } };
    const unavailable: RecommendationDecision = { ...direct, key: "unavailable", available: false,
      target: { ...direct.target!, mainLineId: "line-unavailable" } };
    const lines = recommendationLines([sameName, unavailable, otherLocation, direct]);
    expect(lines.map((line) => line.name)).toEqual([direct.name, direct.name, direct.name]);
    expect(lines[0]?.requirement).toBe("must");
    expect(new Set(lines.map((line) => line.key)).size).toBe(3);
    expect(lines.some((line) => line.target.mainLineId === "line-unavailable")).toBe(false);
    expect(recommendationTargetIdentity(sameName.target!)).not.toBe(recommendationTargetIdentity(otherLocation.target!));
  });

  it("joins exact IDs, combines source reasons, and checks selection only in the active room", () => {
    const result = buildRoomRecommendations({ catalogue, lines: sourceLines, roomId: "room-one", recommendations });
    expect(result.stale).toBe(false);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({ name: "False ceiling painting", requirement: "must", available: true, selected: false,
      target: { mainLineId: "line-paint", basketId: "basket-paint", subBasketId: "sub-paint" } });
    expect(result.decisions[0]?.reasons.map((item) => item.reason)).toEqual([
      "Painting completes the false ceiling surface.", "Finish around the light openings."
    ]);
    expect(result.guidance).toEqual([{ id: "guide-1", sourceId: "line-pop", sourceName: "POP false ceiling", name: "Check substrate", reason: "Confirm that the slab is dry." }]);
    expect(result.decisions[0]?.target?.mainLineId).not.toBe("line-same-name");
  });

  it("does not count an included historical target as a current selected recommendation", () => {
    const lines = sourceLines.map((line) => line.roomId === "room-one" && line.mainLineId === "line-paint"
      ? { ...line, included: true, persistedId: "saved-paint", sourceRevisionVersion: 0, sourceItemVersion: 1 }
      : line);
    const partition = partitionRoomRecommendationSources({ catalogue, lines, roomId: "room-one" });
    expect(partition.historical).toEqual([{ mainLineId: "line-paint", name: "False ceiling painting" }]);
    const direct = buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations });
    expect(direct.stale).toBe(false);
    expect(direct.decisions[0]).toMatchObject({ name: "False ceiling painting", available: true, selected: false });

    const groupAdvice: EstimationCatalogueRecommendations = { sources: recommendations.sources.map((source) => ({
      ...source, rules: [rule({
        id: `group-${source.mainLineId}`, targetKind: "sub_basket", targetMainLineId: null,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
        children: [{ mainLineId: "line-paint", available: true, completionRequired: false,
          revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1 },
        { mainLineId: "line-accent", available: true, completionRequired: true,
          revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1 }],
        unavailableChildCount: 0
      })], guidance: []
    })) };
    const group = buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations: groupAdvice });
    expect(group.stale).toBe(false);
    expect(group.decisions[0]?.children.find((child) => child.target.mainLineId === "line-paint")?.selected).toBe(false);
    expect(group.decisions[0]?.selected).toBe(false);
  });

  it("keeps wrong-parent and unavailable IDs non-actionable without exposing a target name", () => {
    const unavailable: EstimationCatalogueRecommendations = { sources: [{ ...recommendations.sources[0]!, rules: [
      rule({ targetBasketId: "basket-duplicate", targetSubBasketId: "sub-other" }),
      rule({ id: "missing", targetMainLineId: "line-missing", available: false })
    ] }] };
    const result = buildRoomRecommendations({ catalogue, lines: sourceLines.filter((line) => line.mainLineId !== "line-functional"), roomId: "room-one", recommendations: unavailable });
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions.every((item) => !item.available && item.target === null)).toBe(true);
    expect(result.decisions.map((item) => item.name)).toEqual(["Related item unavailable", "Related item unavailable"]);
  });

  it("lists group children individually and leaves a group incomplete when a child is unavailable", () => {
    const group: EstimationCatalogueRecommendations = { sources: [{ ...recommendations.sources[0]!, rules: [rule({
      id: "group", targetKind: "sub_basket", targetMainLineId: null, available: true, completionRequired: true,
      targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
      children: [{ mainLineId: "line-paint", available: true, completionRequired: false, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1 },
        { mainLineId: "line-accent", available: true, completionRequired: true, revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1 }],
      unavailableChildCount: 1
    })] }] };
    const result = buildRoomRecommendations({ catalogue, lines: sourceLines, roomId: "room-one", recommendations: group });
    expect(result.decisions[0]).toMatchObject({ kind: "sub_basket", name: "Ceiling finish", selected: false, unavailableChildCount: 1 });
    expect(result.decisions[0]?.children.map((child) => [child.target.mainLineId, child.completionRequired])).toEqual([
      ["line-paint", false], ["line-accent", true]
    ]);
    expect(result.decisions[0]?.children.every((child) => !child.selected)).toBe(true);
  });

  it("marks a fully included group selected even when its temporary child needs completion internally", () => {
    const lines = sourceLines.map((line) => line.roomId === "room-one" &&
      (line.mainLineId === "line-paint" || line.mainLineId === "line-accent")
      ? { ...line, included: true } : line);
    const groupRule = rule({
      id: "group", targetKind: "sub_basket", targetMainLineId: null, available: true, completionRequired: true,
      targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
      children: [{ mainLineId: "line-paint", available: true, completionRequired: false, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1 },
        { mainLineId: "line-accent", available: true, completionRequired: true, revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1 }],
      unavailableChildCount: 0
    });
    const group: EstimationCatalogueRecommendations = { sources: recommendations.sources.map((source) => ({
      ...source, rules: [{ ...groupRule, id: `group-${source.mainLineId}` }], guidance: []
    })).concat([
      { mainLineId: "line-paint", available: true, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 1, rules: [], guidance: [] },
      { mainLineId: "line-accent", available: true, revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1, rules: [], guidance: [] }
    ]) };
    const selected = buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations: group });
    expect(selected.stale).toBe(false);
    expect(selected.decisions).toHaveLength(1);
    expect(selected.decisions[0]).toMatchObject({ kind: "sub_basket", selected: true, completionRequired: true,
      unavailableChildCount: 0 });
    expect(selected.decisions[0]?.children.every((child) => child.selected)).toBe(true);
    expect(selected.decisions[0]?.reasons).toHaveLength(2);

    const withoutTemporaryChild = lines.map((line) => line.roomId === "room-one" && line.mainLineId === "line-accent"
      ? { ...line, included: false } : line);
    expect(buildRoomRecommendations({ catalogue, lines: withoutTemporaryChild, roomId: "room-one", recommendations: group }).decisions[0]?.selected).toBe(false);

    const unavailableGroup: EstimationCatalogueRecommendations = { sources: group.sources.map((source) => ({
      ...source, rules: source.rules.map((item) => ({ ...item, unavailableChildCount: 1 }))
    })) };
    expect(buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations: unavailableGroup }).decisions[0]?.selected).toBe(false);
  });

  it("marks an included temporary target selected even when two sources recommend it", () => {
    const lines = sourceLines.map((line) => line.roomId === "room-one" && line.mainLineId === "line-accent"
      ? { ...line, included: true } : line);
    const temporary: EstimationCatalogueRecommendations = { sources: recommendations.sources.map((source) => ({
      ...source, guidance: [], rules: [rule({
        id: `temporary-${source.mainLineId}`, targetMainLineId: "line-accent", targetRevisionId: "rev-accent", completionRequired: true
      })]
    })).concat([{ mainLineId: "line-accent", available: true, revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1, rules: [], guidance: [] }]) };
    const result = buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations: temporary });
    expect(result.stale).toBe(false);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({ name: "Accent finish", selected: true, completionRequired: true });
    expect(result.decisions[0]?.reasons).toHaveLength(2);
  });

  it("flags missing or changed source revisions as stale", () => {
    const changed: EstimationCatalogueRecommendations = { sources: [{ ...recommendations.sources[0]!, revisionVersion: 9, rules: [] }] };
    expect(buildRoomRecommendations({ catalogue, lines: sourceLines, roomId: "room-one", recommendations: changed }).stale).toBe(true);
    expect(buildRoomRecommendations({ catalogue, lines: sourceLines, roomId: "room-one", recommendations: { sources: [] } }).stale).toBe(true);
  });

  it("blocks direct and group child actions when target revision metadata differs from the catalogue", () => {
    const onlyPop = sourceLines.filter((line) => line.mainLineId !== "line-functional");
    const direct: EstimationCatalogueRecommendations = { sources: [{ ...recommendations.sources[0]!, rules: [
      rule({ targetRevisionVersion: 9 })
    ] }] };
    expect(buildRoomRecommendations({ catalogue, lines: onlyPop, roomId: "room-one", recommendations: direct }).stale).toBe(true);
    const group: EstimationCatalogueRecommendations = { sources: [{ ...recommendations.sources[0]!, rules: [rule({
      targetKind: "sub_basket", targetMainLineId: null, targetRevisionId: null,
      targetRevisionVersion: null, targetItemVersion: null,
      children: [{ mainLineId: "line-paint", available: true, completionRequired: false, revisionId: "rev-paint", revisionVersion: 1, itemVersion: 9 },
        { mainLineId: "line-accent", available: true, completionRequired: true, revisionId: "rev-accent", revisionVersion: 1, itemVersion: 1 }],
      unavailableChildCount: 0
    })] }] };
    expect(buildRoomRecommendations({ catalogue, lines: onlyPop, roomId: "room-one", recommendations: group }).stale).toBe(true);
  });

  it("explains a persisted historical source without hiding advice from another current source", () => {
    const lines = sourceLines.map((line) => line.roomId === "room-one" && line.mainLineId === "line-pop"
      ? { ...line, persistedId: "saved-pop", revisionId: "old-pop-revision", sourceRevisionVersion: 1, sourceItemVersion: 1 }
      : line);
    const partition = partitionRoomRecommendationSources({ catalogue, lines, roomId: "room-one" });
    expect(partition.current.map((line) => line.mainLineId)).toEqual(["line-functional"]);
    expect(partition.historical).toEqual([{ mainLineId: "line-pop", name: "POP false ceiling" }]);
    const result = buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations: { sources: [recommendations.sources[1]!] } });
    expect(result.stale).toBe(false);
    expect(result.historicalSources).toEqual(partition.historical);
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.reasons.map((reason) => reason.sourceId)).toEqual(["line-functional"]);
    const onlyHistorical = buildRoomRecommendations({ catalogue, lines: lines.filter((line) => line.mainLineId !== "line-functional"), roomId: "room-one", recommendations: { sources: [] } });
    expect(onlyHistorical.stale).toBe(false);
    expect(onlyHistorical.historicalSources).toHaveLength(1);
  });

  it("keeps persisted sources with missing snapshot versions historical after a catalogue update", () => {
    const updatedCatalogue = structuredClone(catalogue);
    const currentSource = updatedCatalogue.items[0]!.subBaskets[0]!.mainLines[0]!;
    currentSource.revisionVersion = 9;
    currentSource.itemVersion = 9;
    const line = sourceLines.find((item) => item.roomId === "room-one" && item.mainLineId === "line-pop")!;
    const currentAdvice: EstimationCatalogueRecommendations = { sources: [{
      ...recommendations.sources[0]!, revisionVersion: 9, itemVersion: 9
    }] };
    for (const savedVersions of [
      { sourceRevisionVersion: undefined, sourceItemVersion: 9 },
      { sourceRevisionVersion: 9, sourceItemVersion: undefined },
      { sourceRevisionVersion: undefined, sourceItemVersion: undefined }
    ]) {
      const savedLine = { ...line, persistedId: "saved-pop", ...savedVersions };
      const partition = partitionRoomRecommendationSources({ catalogue: updatedCatalogue, lines: [savedLine], roomId: "room-one" });
      expect(partition.current).toEqual([]);
      expect(partition.historical).toEqual([{ mainLineId: "line-pop", name: "POP false ceiling" }]);
      const result = buildRoomRecommendations({ catalogue: updatedCatalogue, lines: [savedLine], roomId: "room-one", recommendations: currentAdvice });
      expect(result.stale).toBe(false);
      expect(result.decisions).toEqual([]);
      expect(result.historicalSources).toEqual(partition.historical);
    }
  });

  it("keys a persisted current source by its stored snapshot versions", () => {
    const line = sourceLines.find((item) => item.roomId === "room-one" && item.mainLineId === "line-pop")!;
    const persisted = { ...line, persistedId: "saved-pop", sourceRevisionVersion: 2, sourceItemVersion: 3,
      revisionVersion: undefined, itemVersion: undefined };
    expect(recommendationSourceIdentity(persisted)).toBe(JSON.stringify(["line-pop", "rev-pop", 2, 3]));
    expect(recommendationSourceIdentity({ ...persisted, sourceRevisionVersion: 4 })).not.toBe(recommendationSourceIdentity(persisted));
  });

  it("treats an unsaved included source with a changed catalogue identity as stale until the draft is rebuilt", () => {
    const lines = sourceLines.filter((line) => line.mainLineId !== "line-functional").map((line) =>
      line.roomId === "room-one" && line.mainLineId === "line-pop" ? { ...line, revisionId: "old-pop-revision" } : line
    );
    const partition = partitionRoomRecommendationSources({ catalogue, lines, roomId: "room-one" });
    expect(partition.current).toEqual([]);
    expect(partition.historical).toEqual([]);
    expect(partition.outdatedDraft).toBe(true);
    expect(buildRoomRecommendations({ catalogue, lines, roomId: "room-one", recommendations: { sources: [] } }).stale).toBe(true);
  });
});
