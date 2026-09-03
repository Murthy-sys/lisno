import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* Rendered QA found the Surface Retry and row actions at 36px; jsdom cannot
   measure layout, so the CSS floors that fixed them are guarded here instead. */
const css = readFileSync(
  resolve(process.cwd(), "src/features/ai-estimator-knowledge/ai-estimator-knowledge.css"),
  "utf8"
);

function blockSize(selector: string) {
  const rule = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*\\{([^}]*)\\}`,
    "u"
  ).exec(css);
  return rule?.[1].match(/min-block-size:\s*([^;]+);/u)?.[1].trim() ?? null;
}

describe("Surface touch targets", () => {
  it("keeps the compact Surface actions at the 44px minimum target", () => {
    expect(blockSize(".knowledge-page--item-workspace .knowledge-mode-surfaces__state .ui-button"))
      .toBe("44px");
    expect(blockSize(".knowledge-surface-table .ui-button")).toBe("44px");
  });
});
