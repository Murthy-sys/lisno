import { describe, expect, it } from "vitest";

import { projectCompletionScopeLabel } from "../src/services/project-completion.service.js";

describe("project completion approved scope labels", () => {
  it("uses saved configured basket and line labels with exact lineage", () => {
    const line = {
      source: "configuration" as const, catalogueId: "main-line-lower",
      sectionId: "basket-lower", mainBasketId: "basket-lower",
      mainBasketName: "Original basket", subBasketName: "Original child",
      mainLineId: "main-line-lower", mainLineName: "Original console",
      specification: ""
    };
    expect(projectCompletionScopeLabel(line)).toBe("Original basket · Original child · Original console");
    expect(() => projectCompletionScopeLabel({ ...line, sectionId: "BA" })).toThrow(/basket or line snapshot/u);
    expect(projectCompletionScopeLabel({ ...line, source: "legacy", specification: "BWR ply" }))
      .toBe("BWR ply");
  });
});
