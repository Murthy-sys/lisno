import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(
    process.cwd(),
    "src/features/ai-estimator-knowledge/ai-estimator-knowledge.css"
  ),
  "utf8"
);
const roleThemeStylesheet = readFileSync(
  resolve(process.cwd(), "src/styles/role-themes.css"),
  "utf8"
);
const professionalWorkspaceStart = stylesheet.indexOf(
  "Professional Main Line workspace"
);

function declarations(selector: string, after = 0) {
  const selectorStart = stylesheet.indexOf(selector, after);
  if (selectorStart < 0) throw new Error(`Missing CSS rule for ${selector}`);

  const openingBrace = stylesheet.indexOf("{", selectorStart);
  const closingBrace = stylesheet.indexOf("}", openingBrace);
  if (openingBrace < 0 || closingBrace < 0) {
    throw new Error(`Unclosed CSS rule for ${selector}`);
  }

  const body = stylesheet.slice(openingBrace + 1, closingBrace);
  return new Map(
    [...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, property, value]) => [property, value.trim().replace(/\s+/g, " ")]
    )
  );
}

function classAndAttributeSpecificity(selector: string) {
  return (selector.match(/\.[\w-]+/g) ?? []).length
    + (selector.match(/\[[^\]]+\]/g) ?? []).length;
}

describe("Knowledge Mode toolbar layout", () => {
  it("keeps standalone section toolbars sticky while containing Mode toolbars", () => {
    const sharedToolbar = declarations(".knowledge-section-toolbar");
    expect(sharedToolbar.get("position")).toBe("sticky");
    expect(sharedToolbar.get("inset-block-start")).toBe("0");
    expect(sharedToolbar.get("z-index")).toBe("var(--z-raised)");

    const baseModeToolbar = declarations(".knowledge-mode-block__toolbar");
    expect(baseModeToolbar.get("position")).toBe("static");
    expect(baseModeToolbar.get("inset-block-start")).toBe("auto");
    expect(baseModeToolbar.get("z-index")).toBe("auto");
    expect(baseModeToolbar.get("margin")).toBe("0");

    expect(professionalWorkspaceStart).toBeGreaterThan(-1);
    const modeToolbar = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-block__toolbar",
      professionalWorkspaceStart
    );
    expect(modeToolbar.get("position")).toBe("static");
    expect(modeToolbar.get("inset-block-start")).toBe("auto");
    expect(modeToolbar.get("z-index")).toBe("auto");
    expect(modeToolbar.get("align-items")).toBe("center");
    expect(modeToolbar.get("flex-direction")).toBe("row");
    expect(modeToolbar.get("gap")).toBe("var(--space-2) var(--space-3)");
    expect(modeToolbar.get("min-inline-size")).toBe("0");
    expect(modeToolbar.get("margin")).toBe("0");
    expect(modeToolbar.get("padding")).toBe("0 0 var(--space-3)");
    expect(modeToolbar.get("border-block-end")).toContain("var(--role-line");
    expect(modeToolbar.get("border-radius")).toBe("0");
    expect(modeToolbar.get("background")).toBe("transparent");
  });

  it("aligns the Mode panel and its section blocks to the visible-tab frame", () => {
    const panel = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-panel",
      professionalWorkspaceStart
    );
    expect(panel.get("inline-size")).toBe("100%");
    expect(panel.get("min-inline-size")).toBe("0");
    expect(panel.get("gap")).toBe("var(--space-4)");

    const modeBlockSelector =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface.knowledge-mode-block';
    const block = declarations(modeBlockSelector, professionalWorkspaceStart);
    expect(block.get("inline-size")).toBe("100%");
    expect(block.get("max-inline-size")).toBe("100%");
    expect(block.get("min-inline-size")).toBe("0");
    expect(block.get("gap")).toBe("var(--space-4)");
    expect(block.get("padding")).toBe("var(--space-5)");
    expect(block.get("overflow")).toBe("visible");

    const laterThemeSelector =
      ".ui-app-shell[data-role] .knowledge-page .ui-surface";
    expect(roleThemeStylesheet).toContain(`${laterThemeSelector} {`);
    expect(classAndAttributeSpecificity(modeBlockSelector)).toBeGreaterThan(
      classAndAttributeSpecificity(laterThemeSelector)
    );
  });

  it("keeps Mode metadata, controls, and preview content shrink-safe", () => {
    const modeScope =
      ".knowledge-page--item-workspace .knowledge-mode-panel";
    const dirty = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-block__dirty",
      professionalWorkspaceStart
    );
    expect(dirty.get("min-inline-size")).toBe("0");
    expect(dirty.get("margin-inline-start")).toBe("auto");
    expect(dirty.get("overflow-wrap")).toBe("anywhere");

    const wrappingRulesStart = stylesheet.indexOf(
      `${modeScope} .ui-inline-message__copy`,
      professionalWorkspaceStart
    );
    expect(wrappingRulesStart).toBeGreaterThan(professionalWorkspaceStart);
    for (const selector of [
      `${modeScope} .knowledge-section-toolbar__meta`,
      `${modeScope} .knowledge-section-heading`,
      `${modeScope} .knowledge-section-heading > div`,
      `${modeScope} .knowledge-section-editor`,
      `${modeScope} .knowledge-form-grid`,
      `${modeScope} .ui-field`,
      `${modeScope} .knowledge-master-control`,
      `${modeScope} .ui-inline-message`,
      `${modeScope} .ui-inline-message__copy`
    ]) {
      expect(declarations(selector, professionalWorkspaceStart).get("min-inline-size")).toBe("0");
    }

    for (const selector of [
      `${modeScope} .knowledge-section-toolbar__meta`,
      `${modeScope} .knowledge-section-heading h2`,
      `${modeScope} .knowledge-section-heading h3`,
      `${modeScope} .knowledge-section-heading p`,
      `${modeScope} .ui-field__label`,
      `${modeScope} .ui-field__hint`,
      `${modeScope} .ui-field__error`,
      `${modeScope} .knowledge-help-text`,
      `${modeScope} .ui-inline-message__body`
    ]) {
      const copy = declarations(selector, wrappingRulesStart);
      expect(copy.get("max-inline-size")).toBe("100%");
      expect(copy.get("overflow-wrap")).toBe("anywhere");
    }

    const control = declarations(
      `${modeScope} .ui-control`,
      professionalWorkspaceStart
    );
    expect(control.get("min-inline-size")).toBe("0");
    expect(control.get("max-inline-size")).toBe("100%");
    expect(control.get("min-block-size")).toBe("44px");

    const previewSelector =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .knowledge-mode-block > .ui-surface.knowledge-preview-panel';
    const preview = declarations(previewSelector, professionalWorkspaceStart);
    expect(preview.get("min-inline-size")).toBe("0");
    expect(preview.get("margin-block-start")).toBe("0");
    expect(preview.get("padding")).toBe("var(--space-4)");
    expect(preview.get("box-shadow")).toBe("none");

    const laterThemeSelector =
      ".ui-app-shell[data-role] .knowledge-page .ui-surface";
    expect(classAndAttributeSpecificity(previewSelector)).toBeGreaterThan(
      classAndAttributeSpecificity(laterThemeSelector)
    );
  });

  it("uses a content-sized Mode page state without fixed-height clipping", () => {
    const pageState = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-panel > .ui-page-state",
      professionalWorkspaceStart
    );
    expect(pageState.get("min-block-size")).toBe("0");
    expect(pageState.get("min-inline-size")).toBe("0");
    expect(pageState.get("padding")).toBe("var(--space-7) var(--space-5)");
    expect(pageState.get("border")).toContain("var(--role-line");
    expect(pageState.get("border-radius")).toBe("var(--radius-surface)");
    expect(pageState.has("block-size")).toBe(false);
    expect(pageState.has("height")).toBe(false);
  });

  it("progressively stacks Mode grids, previews, and metadata on smaller screens", () => {
    const tabletStart = stylesheet.indexOf(
      "@media (max-width: 768px)",
      professionalWorkspaceStart
    );
    expect(tabletStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-panel .knowledge-form-grid",
        tabletStart
      ).get("grid-template-columns")
    ).toBe("repeat(auto-fit, minmax(min(100%, 14rem), 1fr))");

    const compactStart = stylesheet.indexOf(
      "@media (max-width: 640px)",
      professionalWorkspaceStart
    );
    expect(compactStart).toBeGreaterThan(tabletStart);
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-panel .knowledge-preview-result dl",
        compactStart
      ).get("grid-template-columns")
    ).toBe("minmax(0, 1fr)");

    const mobileStart = stylesheet.indexOf(
      "@media (max-width: 480px)",
      professionalWorkspaceStart
    );
    expect(mobileStart).toBeGreaterThan(compactStart);

    const block = declarations(
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface.knowledge-mode-block',
      mobileStart
    );
    const pageState = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-panel > .ui-page-state",
      mobileStart
    );
    expect(block.get("padding")).toBe("var(--space-4)");
    expect(pageState.get("padding")).toBe("var(--space-4)");

    const toolbar = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-block__toolbar",
      mobileStart
    );
    expect(toolbar.get("align-items")).toBe("flex-start");
    expect(toolbar.get("flex-direction")).toBe("column");
    expect(toolbar.get("gap")).toBe("var(--space-1)");
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-block__dirty",
        mobileStart
      ).get("margin-inline-start")
    ).toBe("0");
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-panel .knowledge-preview-actions .ui-button",
        mobileStart
      ).get("inline-size")
    ).toBe("100%");
  });

  it("keeps compact Mode controls touch-safe for coarse pointers", () => {
    const coarseStart = stylesheet.indexOf(
      "@media (pointer: coarse)",
      professionalWorkspaceStart
    );
    expect(coarseStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-panel .ui-button--compact",
        coarseStart
      ).get("min-block-size")
    ).toBe("44px");
  });

  it("keeps the component builder and Execution source controls shrink-safe", () => {
    const configuration = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-configuration",
      professionalWorkspaceStart
    );
    expect(configuration.get("display")).toBe("grid");
    expect(configuration.get("gap")).toBe("var(--space-4)");
    expect(configuration.get("min-inline-size")).toBe("0");

    const definition = declarations(
      ".knowledge-page--item-workspace .knowledge-mode-field__definition",
      professionalWorkspaceStart
    );
    expect(definition.get("display")).toBe("grid");
    expect(definition.get("grid-template-columns")).toContain("minmax(10rem, 0.7fr)");
    expect(definition.get("min-inline-size")).toBe("0");

    const tabletStart = stylesheet.indexOf(
      "@media (max-width: 768px)",
      professionalWorkspaceStart
    );
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-field__definition",
        tabletStart
      ).get("grid-template-columns")
    ).toBe("minmax(0, 1fr)");

    const executionSourceOptionSelector =
      ".knowledge-page--item-workspace .knowledge-mode-configuration__execution-source-options label";
    const executionSourceOptionStart = stylesheet.indexOf(
      `\n${executionSourceOptionSelector} {`,
      professionalWorkspaceStart
    );
    const radioOption = declarations(
      executionSourceOptionSelector,
      executionSourceOptionStart
    );
    expect(radioOption.get("min-block-size")).toBe("44px");
    expect(radioOption.get("min-inline-size")).toBe("0");
    expect(radioOption.get("overflow-wrap")).toBe("anywhere");

    const mobileStart = stylesheet.indexOf(
      "@media (max-width: 480px)",
      professionalWorkspaceStart
    );
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-configuration__execution-source-options label",
        mobileStart
      ).get("inline-size")
    ).toBe("100%");
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-mode-configuration__recovery-actions .ui-button",
        mobileStart
      ).get("inline-size")
    ).toBe("100%");
  });
});
