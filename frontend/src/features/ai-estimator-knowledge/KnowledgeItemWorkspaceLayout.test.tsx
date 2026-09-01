import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";

const featureDirectory = resolve(
  process.cwd(),
  "src/features/ai-estimator-knowledge"
);
const stylesheet = readFileSync(
  resolve(featureDirectory, "ai-estimator-knowledge.css"),
  "utf8"
);
const workspaceSource = readFileSync(
  resolve(featureDirectory, "KnowledgeItemWorkspacePage.tsx"),
  "utf8"
);
const overviewPanelSource = readFileSync(
  resolve(featureDirectory, "KnowledgeOverviewPanel.tsx"),
  "utf8"
);
const navigationSource = readFileSync(
  resolve(featureDirectory, "KnowledgeSectionNavigation.tsx"),
  "utf8"
);
const workspaceStatusSource = readFileSync(
  resolve(featureDirectory, "KnowledgeWorkspaceStatus.tsx"),
  "utf8"
);
const commandBarSource = readFileSync(
  resolve(featureDirectory, "KnowledgeSectionCommandBar.tsx"),
  "utf8"
);
const historySource = readFileSync(
  resolve(featureDirectory, "KnowledgeRevisionHistory.tsx"),
  "utf8"
);
const conflictReviewSource = readFileSync(
  resolve(featureDirectory, "KnowledgeConflictReview.tsx"),
  "utf8"
);
const pageHeaderSource = readFileSync(
  resolve(process.cwd(), "src/components/ui/PageHeader.tsx"),
  "utf8"
);
const fieldSource = readFileSync(
  resolve(process.cwd(), "src/components/ui/Field.tsx"),
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
      ([, property, value]) => [
        property,
        value.trim().replace(/\s+/g, " ")
      ]
    )
  );
}

function classAndAttributeSpecificity(selector: string) {
  return (selector.match(/\.[\w-]+/g) ?? []).length
    + (selector.match(/\[[^\]]+\]/g) ?? []).length;
}

describe("Super Admin knowledge item workspace layout", () => {
  it("connects the approved workspace hooks without changing shared primitives", () => {
    expect(workspaceSource).toContain(
      '<div className="knowledge-page knowledge-page--item-workspace">'
    );
    expect(workspaceSource).toContain(
      '" knowledge-workspace-section--overview"'
    );
    expect(workspaceSource).toContain("<KnowledgeOverviewPanel");
    expect(workspaceSource).toContain('className="knowledge-workspace-layout"');
    expect(workspaceSource).toContain('className="knowledge-workspace-main"');
    expect(navigationSource).toContain('className="knowledge-section-tabs-shell"');
    expect(workspaceStatusSource).toContain('className="knowledge-workspace-status"');
    expect(commandBarSource).toContain('className="knowledge-section-command-bar"');
    expect(historySource).toContain("knowledge-workspace-history-rail");
    expect(conflictReviewSource).toContain('className="knowledge-conflict-review"');
    expect(workspaceSource).not.toContain('description={item.description');
    expect(workspaceSource).toContain("<PageHeader");
    expect(pageHeaderSource).not.toContain("knowledge-page--item-workspace");
    expect(fieldSource).not.toContain("knowledge-overview__");
    expect(overviewPanelSource).toContain('className="knowledge-overview__configured-grid"');
    expect(overviewPanelSource).toContain('className="knowledge-overview__context"');
    expect(overviewPanelSource).toContain('className="knowledge-overview__principal-grid"');
    expect(overviewPanelSource).toContain('className="knowledge-overview__cards"');

    render(
      <KnowledgeSectionEditor
        sectionKey="overview"
        payload={{}}
        masters={{}}
        relationshipBaskets={[]}
        relationshipItems={[]}
        currentMainLineId="line-1"
        readOnly={false}
        canQuickAdd={false}
        resetKey="overview-layout"
        onChange={() => undefined}
        onDirty={() => undefined}
        onValidationChange={() => undefined}
        onQuickAdd={() => undefined}
      />
    );

    const editor = screen.getByRole("heading", { name: "Overview" }).closest(".knowledge-section-editor");
    expect(editor).toHaveClass("knowledge-section-editor");
    expect(editor).not.toHaveClass("knowledge-section-editor--overview");
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Priority" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Modes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Surfaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Section applicability rule" })).not.toBeInTheDocument();
  });

  it("retains the structured editor hooks used by Recommendations and Quality", () => {
    const editorProps = {
      masters: {},
      relationshipBaskets: [],
      relationshipItems: [],
      currentMainLineId: "line-1",
      readOnly: false,
      canQuickAdd: false,
      onChange: () => undefined,
      onDirty: () => undefined,
      onValidationChange: () => undefined,
      onQuickAdd: () => undefined
    } as const;

    render(
      <>
        <KnowledgeSectionEditor
          {...editorProps}
          sectionKey="recommendations"
          payload={{}}
          resetKey="recommendations-layout"
        />
        <KnowledgeSectionEditor
          {...editorProps}
          sectionKey="quality"
          payload={{}}
          resetKey="quality-layout"
        />
      </>
    );

    for (const name of ["Recommendations", "Quality parameters"]) {
      expect(screen.getByRole("region", { name })).toHaveClass("knowledge-repeater");
    }
    expect(
      screen.getByRole("heading", { name: "Recommendations", level: 2 })
        .closest(".knowledge-section-editor")
    ).toHaveClass("knowledge-section-editor");
    expect(
      screen.getByRole("heading", { name: "Quality", level: 2 })
        .closest(".knowledge-section-editor")
    ).toHaveClass("knowledge-section-editor");
  });

  it("keeps the wide header coherent and aligns tabs to the main workspace", () => {
    expect(professionalWorkspaceStart).toBeGreaterThan(-1);
    const header = declarations(
      ".knowledge-page--item-workspace > .ui-page-header"
    );
    expect(header.get("display")).toBe("grid");
    expect(header.get("grid-template-columns")).toBe("minmax(0, 1fr) auto");

    const breadcrumb = declarations(
      ".knowledge-page--item-workspace > .ui-page-header .ui-page-header__breadcrumb"
    );
    expect(breadcrumb.get("grid-column")).toBe("1 / -1");

    const actions = declarations(
      ".knowledge-page--item-workspace > .ui-page-header .ui-page-header__actions"
    );
    expect(actions.get("grid-column")).toBe("2");
    expect(actions.get("justify-content")).toBe("flex-end");

    const tabs = declarations(
      ".knowledge-page--item-workspace .knowledge-section-tabs",
      professionalWorkspaceStart
    );
    expect(tabs.get("inline-size")).toBe("100%");
    expect(tabs.get("max-inline-size")).toBe("100%");
    expect(tabs.get("min-inline-size")).toBe("0");
    expect(tabs.get("justify-self")).toBe("stretch");

    const tabsShell = declarations(
      ".knowledge-section-tabs-shell",
      professionalWorkspaceStart
    );
    expect(tabsShell.get("inline-size")).toBe("100%");
    expect(tabsShell.get("max-inline-size")).toBe("100%");
    expect(tabsShell.get("min-inline-size")).toBe("0");

    expect(stylesheet).not.toContain(
      ".knowledge-page--item-workspace .knowledge-section-tabs {\n  inline-size: max-content;"
    );
  });

  it("uses the 90rem shell measure with a flexible main column and secondary history rail", () => {
    const page = declarations(
      ".knowledge-page--item-workspace",
      professionalWorkspaceStart
    );
    expect(page.get("inline-size")).toBe("100%");
    expect(page.get("max-inline-size")).toBe("var(--content-wide)");
    expect(page.get("min-inline-size")).toBe("0");

    const layout = declarations(
      ".knowledge-workspace-layout",
      professionalWorkspaceStart
    );
    expect(layout.get("display")).toBe("grid");
    expect(layout.get("grid-template-columns")).toBe(
      "minmax(0, 1fr) minmax(16rem, 18rem)"
    );
    expect(layout.get("min-inline-size")).toBe("0");

    const main = declarations(
      ".knowledge-workspace-main",
      professionalWorkspaceStart
    );
    expect(main.get("display")).toBe("grid");
    expect(main.get("min-inline-size")).toBe("0");

    const history = declarations(
      ".knowledge-workspace-history-rail {",
      professionalWorkspaceStart
    );
    expect(history.get("position")).toBe("sticky");
    expect(history.get("max-inline-size")).toBe("18rem");
    expect(history.get("box-shadow")).toBe("none");

    const overviewSurface = declarations(
      ".knowledge-page--item-workspace .knowledge-workspace-section--overview",
      professionalWorkspaceStart
    );
    expect(overviewSurface.get("inline-size")).toBe("100%");
    expect(overviewSurface.get("max-inline-size")).toBe("none");
    expect(stylesheet).not.toContain("max-inline-size: 72rem");
  });

  it("aligns the Overview command bar and card with compatible token insets", () => {
    const commandBar = declarations(
      ".knowledge-page--item-workspace .knowledge-section-command-bar",
      professionalWorkspaceStart
    );
    expect(commandBar.get("inline-size")).toBe("100%");
    expect(commandBar.get("min-inline-size")).toBe("0");
    expect(commandBar.get("padding")).toBe(
      "var(--space-3) var(--space-5)"
    );

    const overviewSurfaceSelector =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface.knowledge-workspace-section--overview';
    const overviewSurface = declarations(
      overviewSurfaceSelector,
      professionalWorkspaceStart
    );
    expect(overviewSurface.get("padding")).toBe("var(--space-5)");

    const workspaceSurface = declarations(
      ".knowledge-page--item-workspace .knowledge-workspace-section--overview",
      professionalWorkspaceStart
    );
    expect(workspaceSurface.get("inline-size")).toBe("100%");
    expect(workspaceSurface.get("max-inline-size")).toBe("none");
    expect(workspaceSurface.get("min-inline-size")).toBe("0");

    const laterThemeSelector =
      ".ui-app-shell[data-role] .knowledge-page .ui-surface";
    expect(roleThemeStylesheet).toContain(`${laterThemeSelector} {`);
    expect(classAndAttributeSpecificity(overviewSurfaceSelector)).toBeGreaterThan(
      classAndAttributeSpecificity(laterThemeSelector)
    );
  });

  it("aligns direct visible-tab surfaces and editor headings to the Overview inset", () => {
    const directSurfaceSelector =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface.knowledge-workspace-section';
    const directSurface = declarations(
      directSurfaceSelector,
      professionalWorkspaceStart
    );
    expect(directSurface.get("inline-size")).toBe("100%");
    expect(directSurface.get("max-inline-size")).toBe("100%");
    expect(directSurface.get("min-inline-size")).toBe("0");
    expect(directSurface.get("padding")).toBe("var(--space-5)");
    expect(directSurface.get("overflow")).toBe("visible");

    const laterThemeSelector =
      ".ui-app-shell[data-role] .knowledge-page .ui-surface";
    expect(roleThemeStylesheet).toContain(`${laterThemeSelector} {`);
    expect(classAndAttributeSpecificity(directSurfaceSelector)).toBeGreaterThan(
      classAndAttributeSpecificity(laterThemeSelector)
    );

    const editor = declarations(
      ".knowledge-page--item-workspace .knowledge-workspace-section > .knowledge-section-editor",
      professionalWorkspaceStart
    );
    expect(editor.get("gap")).toBe("var(--space-4)");
    expect(editor.get("min-inline-size")).toBe("0");

    const heading = declarations(
      ".knowledge-page--item-workspace .knowledge-workspace-section > .knowledge-section-editor > .knowledge-section-heading {",
      professionalWorkspaceStart
    );
    expect(heading.get("flex-wrap")).toBe("wrap");

    for (const selector of [
      ".knowledge-page--item-workspace .knowledge-workspace-section > .knowledge-section-editor > .knowledge-section-heading",
      ".knowledge-page--item-workspace .knowledge-workspace-section > .knowledge-section-editor > .knowledge-section-heading > div"
    ]) {
      expect(declarations(selector, professionalWorkspaceStart).get("min-inline-size")).toBe("0");
    }

    for (const selector of [
      ".knowledge-page--item-workspace .knowledge-workspace-section > .knowledge-section-editor > .knowledge-section-heading h2",
      ".knowledge-page--item-workspace .knowledge-workspace-section > .knowledge-section-editor > .knowledge-section-heading p"
    ]) {
      const copy = declarations(selector, professionalWorkspaceStart);
      expect(copy.get("max-inline-size")).toBe("100%");
      expect(copy.get("overflow-wrap")).toBe("anywhere");
    }
  });

  it("keeps visible-tab repeaters aligned, shrink-safe, and visually subordinate", () => {
    const repeaterScope =
      ".knowledge-page--item-workspace .knowledge-workspace-section";
    for (const selector of [
      `${repeaterScope} .knowledge-repeater`,
      `${repeaterScope} .knowledge-repeater__header`,
      `${repeaterScope} .knowledge-repeater__list`,
      `${repeaterScope} .knowledge-repeater__list > li`,
      `${repeaterScope} .knowledge-repeater__row`,
      `${repeaterScope} .knowledge-repeater__content`
    ]) {
      expect(declarations(selector, professionalWorkspaceStart).get("min-inline-size")).toBe("0");
    }

    const header = declarations(
      `${repeaterScope} .knowledge-repeater__header {`,
      professionalWorkspaceStart
    );
    expect(header.get("align-items")).toBe("center");
    expect(header.get("flex-direction")).toBe("row");
    expect(header.get("justify-content")).toBe("space-between");
    expect(header.get("gap")).toBe("var(--space-3)");

    const addButton = declarations(
      `${repeaterScope} .knowledge-repeater__header > .ui-button`,
      professionalWorkspaceStart
    );
    expect(addButton.get("flex")).toBe("0 0 auto");
    expect(addButton.get("min-block-size")).toBe("44px");

    const baseRepeaterStart = stylesheet.indexOf(".knowledge-repeater__list {");
    const baseEmpty = declarations(
      ".knowledge-repeater__empty {",
      baseRepeaterStart
    );
    expect(baseEmpty.get("border")).toContain("1px dashed");

    const empty = declarations(
      `${repeaterScope} .knowledge-repeater__empty`,
      professionalWorkspaceStart
    );
    expect(empty.get("min-inline-size")).toBe("0");
    expect(empty.get("margin")).toBe("0");
    expect(empty.get("padding")).toBe("var(--space-4)");
    expect(empty.get("background")).toContain("var(--role-deck-tint");
    expect(empty.get("overflow-wrap")).toBe("anywhere");
    expect(empty.has("border")).toBe(false);

    const rowSelector = `${repeaterScope} .knowledge-repeater__row {`;
    const rowRuleStart = stylesheet.indexOf(
      rowSelector,
      professionalWorkspaceStart
    );
    expect(rowRuleStart).toBeGreaterThan(professionalWorkspaceStart);
    const row = declarations(rowSelector, rowRuleStart);
    expect(row.get("align-items")).toBe("flex-start");
    expect(row.get("gap")).toBe("var(--space-4)");
    expect(row.get("background")).toContain("var(--role-deck-tint");
    expect(row.has("box-shadow")).toBe(false);

    const content = declarations(
      `${repeaterScope} .knowledge-repeater__content {`,
      rowRuleStart + rowSelector.length
    );
    expect(content.get("inline-size")).toBe("100%");

    const grid = declarations(
      `${repeaterScope} .knowledge-repeater__content > .knowledge-form-grid`,
      professionalWorkspaceStart
    );
    expect(grid.get("grid-template-columns")).toBe(
      "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))"
    );
    expect(grid.get("align-items")).toBe("start");
    expect(grid.get("gap")).toBe("var(--space-4) var(--space-3)");
    expect(grid.get("min-inline-size")).toBe("0");

    const wrappingRulesStart = stylesheet.indexOf(
      `${repeaterScope} .knowledge-repeater .ui-field__label`,
      professionalWorkspaceStart
    );
    expect(wrappingRulesStart).toBeGreaterThan(professionalWorkspaceStart);
    for (const selector of [
      `${repeaterScope} .knowledge-repeater .ui-field__label`,
      `${repeaterScope} .knowledge-repeater .ui-field__hint`,
      `${repeaterScope} .knowledge-repeater .ui-field__error`,
      `${repeaterScope} .knowledge-repeater .knowledge-checkbox-row`
    ]) {
      const copy = declarations(selector, wrappingRulesStart);
      expect(copy.get("min-inline-size")).toBe("0");
      expect(copy.get("max-inline-size")).toBe("100%");
      expect(copy.get("overflow-wrap")).toBe("anywhere");
    }

    const control = declarations(
      `${repeaterScope} .knowledge-repeater .ui-control`,
      professionalWorkspaceStart
    );
    expect(control.get("min-inline-size")).toBe("0");
    expect(control.get("max-inline-size")).toBe("100%");
    expect(control.get("min-block-size")).toBe("44px");

    const checkboxSelector =
      `${repeaterScope} .knowledge-repeater .knowledge-checkbox-row {`;
    const wrappingCheckboxStart = stylesheet.indexOf(
      checkboxSelector,
      wrappingRulesStart
    );
    expect(wrappingCheckboxStart).toBeGreaterThan(wrappingRulesStart);
    const checkbox = declarations(
      checkboxSelector,
      wrappingCheckboxStart + checkboxSelector.length
    );
    expect(checkbox.get("align-self")).toBe("start");
    expect(checkbox.get("align-items")).toBe("flex-start");

    const actionRail = declarations(
      `${repeaterScope} .knowledge-repeater__actions {`,
      professionalWorkspaceStart
    );
    expect(actionRail.get("align-self")).toBe("flex-start");
    expect(actionRail.get("align-items")).toBe("flex-start");
    expect(actionRail.get("justify-content")).toBe("flex-end");
    expect(actionRail.get("flex-wrap")).toBe("wrap");
    expect(actionRail.get("min-inline-size")).toBe("0");
    expect(actionRail.get("margin-inline-start")).toBe("auto");
  });

  it("keeps direct section PageStates compact and aligned at every inset", () => {
    const selector =
      ".knowledge-page--item-workspace .knowledge-section-panel > .ui-page-state";
    const pageState = declarations(selector, professionalWorkspaceStart);
    expect(pageState.get("min-block-size")).toBe("0");
    expect(pageState.get("min-inline-size")).toBe("0");
    expect(pageState.get("padding")).toBe("var(--space-7) var(--space-5)");
    expect(pageState.get("border")).toContain("var(--role-line");
    expect(pageState.get("border-radius")).toBe("var(--radius-surface)");
    expect(pageState.get("background")).toBe(
      "var(--role-deck, var(--color-surface))"
    );

    const mobileStart = stylesheet.indexOf(
      "@media (max-width: 480px)",
      professionalWorkspaceStart
    );
    expect(mobileStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(declarations(selector, mobileStart).get("padding")).toBe(
      "var(--space-4)"
    );
  });

  it("progressively stacks visible-tab repeaters without losing row ownership", () => {
    const repeaterScope =
      ".knowledge-page--item-workspace .knowledge-workspace-section";
    const tabletStart = stylesheet.indexOf(
      "@media (max-width: 768px)",
      professionalWorkspaceStart
    );
    expect(tabletStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(
        `${repeaterScope} .knowledge-repeater__content > .knowledge-form-grid`,
        tabletStart
      ).get("grid-template-columns")
    ).toBe("repeat(auto-fit, minmax(min(100%, 14rem), 1fr))");

    const compactStart = stylesheet.indexOf(
      "@media (max-width: 640px)",
      professionalWorkspaceStart
    );
    expect(compactStart).toBeGreaterThan(tabletStart);
    const compactHeader = declarations(
      `${repeaterScope} .knowledge-repeater__header`,
      compactStart
    );
    expect(compactHeader.get("align-items")).toBe("center");
    expect(compactHeader.get("flex-direction")).toBe("row");

    const compactRow = declarations(
      `${repeaterScope} .knowledge-repeater__row`,
      compactStart
    );
    expect(compactRow.get("align-items")).toBe("stretch");
    expect(compactRow.get("flex-direction")).toBe("column");

    const compactActions = declarations(
      `${repeaterScope} .knowledge-repeater__actions`,
      compactStart
    );
    expect(compactActions.get("align-self")).toBe("stretch");
    expect(compactActions.get("inline-size")).toBe("100%");
    expect(compactActions.get("margin-inline-start")).toBe("0");
    expect(compactActions.get("padding-block-start")).toBe("var(--space-3)");
    expect(compactActions.get("border-block-start")).toContain("var(--role-line");

    const mobileStart = stylesheet.indexOf(
      "@media (max-width: 480px)",
      professionalWorkspaceStart
    );
    expect(mobileStart).toBeGreaterThan(compactStart);

    const directSurface = declarations(
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface.knowledge-workspace-section',
      mobileStart
    );
    expect(directSurface.get("padding")).toBe("var(--space-4)");

    const mobileHeader = declarations(
      `${repeaterScope} .knowledge-repeater__header`,
      mobileStart
    );
    expect(mobileHeader.get("align-items")).toBe("stretch");
    expect(mobileHeader.get("flex-direction")).toBe("column");
    expect(
      declarations(
        `${repeaterScope} .knowledge-repeater__header > .ui-button`,
        mobileStart
      ).get("inline-size")
    ).toBe("100%");
    expect(
      declarations(
        `${repeaterScope} .knowledge-repeater__content > .knowledge-form-grid`,
        mobileStart
      ).get("grid-template-columns")
    ).toBe("minmax(0, 1fr)");
    expect(
      declarations(
        `${repeaterScope} .knowledge-repeater__row`,
        mobileStart
      ).get("padding")
    ).toBe("var(--space-3)");
  });

  it("uses a compact Overview hierarchy and equal configured-field geometry", () => {
    const overview = declarations(
      ".knowledge-page--item-workspace .knowledge-workspace-section--overview .knowledge-overview",
      professionalWorkspaceStart
    );
    expect(overview.get("gap")).toBe("var(--space-4)");
    expect(overview.get("min-inline-size")).toBe("0");

    const context = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__context",
      professionalWorkspaceStart
    );
    expect(context.get("display")).toBe("flex");
    expect(context.get("align-items")).toBe("baseline");
    expect(context.get("flex-wrap")).toBe("wrap");
    expect(context.get("gap")).toBe("var(--space-1)");
    expect(context.get("margin")).toBe("0");
    expect(context.get("padding-block")).toBe("var(--space-2)");
    expect(context.get("border-block-end")).toContain("var(--role-line");

    const configuredSection = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__section--configured",
      professionalWorkspaceStart
    );
    expect(configuredSection.get("gap")).toBe("var(--space-4)");
    expect(configuredSection.get("min-inline-size")).toBe("0");

    const configuredBase = declarations(".knowledge-overview__configured-grid");
    expect(configuredBase.get("display")).toBe("grid");

    const configured = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__configured-grid",
      professionalWorkspaceStart
    );
    expect(configured.get("grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
    expect(configured.get("align-items")).toBe("start");
    expect(configured.get("gap")).toBe("var(--space-5)");
    expect(configured.get("min-inline-size")).toBe("0");

    const configuredField = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__configured-field",
      professionalWorkspaceStart
    );
    expect(configuredField.get("display")).toBe("grid");
    expect(configuredField.get("align-content")).toBe("start");
    expect(configuredField.get("gap")).toBe("var(--space-2)");
    expect(configuredField.get("min-inline-size")).toBe("0");

    const fieldLabel = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__configured-field .ui-field__label",
      professionalWorkspaceStart
    );
    const surfaceLabel = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__configured-field .knowledge-surface-multiselect__label",
      professionalWorkspaceStart
    );
    for (const label of [fieldLabel, surfaceLabel]) {
      expect(label.get("min-block-size")).toBe("1.5rem");
      expect(label.get("margin")).toBe("0 0 var(--space-2)");
      expect(label.get("line-height")).toBe("1.5");
      expect(label.get("overflow-wrap")).toBe("anywhere");
    }

    const cards = declarations(".knowledge-overview__cards");
    expect(cards.get("grid-template-columns")).toBe("repeat(3, minmax(0, 1fr))");
    expect(cards.get("min-width")).toBe("0");

    const configuredControl = declarations(
      ".knowledge-overview__configured-field .ui-control",
      professionalWorkspaceStart
    );
    const surfaceTrigger = declarations(
      ".knowledge-overview__configured-field .knowledge-surface-multiselect__trigger",
      professionalWorkspaceStart
    );
    for (const control of [configuredControl, surfaceTrigger]) {
      expect(control.get("inline-size")).toBe("100%");
      expect(control.get("max-inline-size")).toBe("100%");
      expect(control.get("min-block-size")).toBe("44px");
    }

    const quickAdd = declarations(
      ".knowledge-overview__quick-add",
      professionalWorkspaceStart
    );
    expect(quickAdd.get("justify-self")).toBe("start");
    expect(quickAdd.get("margin")).toBe("0");

    expect(stylesheet).not.toContain(".knowledge-overview__description");
    expect(stylesheet).not.toContain(".knowledge-overview__priority-grid");
    expect(stylesheet).not.toContain(".knowledge-overview__classification-grid");

    expect(stylesheet).not.toContain(
      ".knowledge-page--item-workspace .knowledge-mode-panel { max-inline-size"
    );
  });

  it("stacks and wraps the Overview fields with compact mobile insets", () => {
    const tabletStart = stylesheet.indexOf(
      "@media (max-width: 768px)",
      professionalWorkspaceStart
    );
    expect(tabletStart).toBeGreaterThan(professionalWorkspaceStart);

    const configured = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__configured-grid",
      tabletStart
    );
    expect(configured.get("grid-template-columns")).toBe("minmax(0, 1fr)");
    expect(configured.get("gap")).toBe("var(--space-4)");

    const mobileStart = stylesheet.indexOf(
      "@media (max-width: 480px)",
      professionalWorkspaceStart
    );
    expect(mobileStart).toBeGreaterThan(tabletStart);

    const commandBar = declarations(
      ".knowledge-page--item-workspace .knowledge-section-command-bar",
      mobileStart
    );
    expect(commandBar.get("padding-inline")).toBe("var(--space-4)");

    const overviewSurface = declarations(
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface.knowledge-workspace-section--overview',
      mobileStart
    );
    expect(overviewSurface.get("padding")).toBe("var(--space-4)");

    const context = declarations(
      ".knowledge-page--item-workspace .knowledge-overview__context",
      mobileStart
    );
    expect(context.get("align-items")).toBe("flex-start");
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-overview__context-separator",
        mobileStart
      ).get("display")
    ).toBe("none");
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-overview__context-basket",
        mobileStart
      ).get("flex-basis")
    ).toBe("100%");
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-overview__quick-add",
        mobileStart
      ).get("min-block-size")
    ).toBe("44px");
  });

  it("strengthens only Super Admin item-workspace controls and preserves every state", () => {
    const scope =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace';
    const control = declarations(`${scope} .ui-control`);
    expect(control.get("border-color")).toContain("var(--role-line-strong");
    expect(control.get("background-color")).toContain("var(--role-deck-tint");

    expect(declarations(`${scope} .ui-control:hover:not(:disabled):not([aria-invalid="true"])`).get("border-color")).toBe(
      "var(--role-accent, var(--color-border-strong))"
    );
    expect(declarations(`${scope} .ui-control:focus-visible`).get("box-shadow")).toBe("var(--focus-ring)");
    expect(declarations(`${scope} .ui-control[aria-invalid="true"]`).get("border-color")).toBe("var(--color-danger)");

    const disabled = declarations(`${scope} .ui-control:disabled`);
    expect(disabled.get("background-color")).toBe("var(--role-deck-tint, var(--color-surface-subtle))");
    expect(disabled.get("cursor")).toBe("not-allowed");
  });

  it("out-ranks the later global knowledge control theme regardless of cascade order", () => {
    const laterThemeSelector =
      ".ui-app-shell[data-role] .knowledge-page .ui-control";
    const itemWorkspaceSelector =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-control';

    expect(roleThemeStylesheet).toContain(`${laterThemeSelector},`);
    expect(roleThemeStylesheet).toContain("border-color: var(--role-line-strong);");
    expect(roleThemeStylesheet).toContain("background-color: var(--role-deck);");
    expect(stylesheet).toContain(`${itemWorkspaceSelector} {`);
    expect(classAndAttributeSpecificity(itemWorkspaceSelector)).toBeGreaterThan(
      classAndAttributeSpecificity(laterThemeSelector)
    );
  });

  it("keeps secondary workspace surfaces flatter than the later role-theme Surface rule", () => {
    const laterThemeSelector =
      ".ui-app-shell[data-role] .knowledge-page .ui-surface";
    const scope =
      '.ui-app-shell[data-role="super_admin"] .knowledge-page.knowledge-page--item-workspace .ui-surface';

    expect(roleThemeStylesheet).toContain(`${laterThemeSelector} {`);
    for (const className of [
      "knowledge-workspace-status",
      "knowledge-workspace-history-rail",
      "knowledge-conflict-review"
    ]) {
      const selector = `${scope}.${className}`;
      expect(declarations(selector, professionalWorkspaceStart).get("box-shadow")).toBe("none");
      expect(classAndAttributeSpecificity(selector)).toBeGreaterThan(
        classAndAttributeSpecificity(laterThemeSelector)
      );
    }
  });

  it("presents a compact status strip and one contextual command bar", () => {
    const status = declarations(
      ".knowledge-workspace-status",
      professionalWorkspaceStart
    );
    expect(status.get("display")).toBe("grid");
    expect(status.get("grid-template-columns")).toBe(
      "minmax(14rem, 0.72fr) minmax(0, 2fr)"
    );
    expect(status.get("padding")).toBe("var(--space-4) var(--space-5)");
    expect(status.get("box-shadow")).toBe("none");

    const statusValues = declarations(
      ".knowledge-workspace-status .knowledge-summary-list",
      professionalWorkspaceStart
    );
    expect(statusValues.get("grid-template-columns")).toBe(
      "repeat(3, minmax(0, 1fr))"
    );
    expect(statusValues.get("min-inline-size")).toBe("0");

    const commandBar = declarations(
      ".knowledge-section-command-bar",
      professionalWorkspaceStart
    );
    expect(commandBar.get("position")).toBe("sticky");
    expect(commandBar.get("grid-template-columns")).toBe(
      "auto minmax(0, 1fr) auto"
    );
    expect(commandBar.get("background")).toContain("var(--role-deck");

    const commandSave = declarations(
      ".knowledge-section-command-bar__save",
      professionalWorkspaceStart
    );
    expect(commandSave.get("min-block-size")).toBe("44px");

    const conflictValues = declarations(
      ".knowledge-conflict-review__values {",
      professionalWorkspaceStart
    );
    expect(conflictValues.get("grid-template-columns")).toBe(
      "repeat(2, minmax(0, 1fr))"
    );
    expect(conflictValues.get("min-inline-size")).toBe("0");
  });

  it("stacks before 1024px compression and switches to the selector at 768px", () => {
    const responsiveStart = stylesheet.indexOf("@media (max-width: 1100px)");
    expect(responsiveStart).toBeGreaterThan(-1);
    expect(
      declarations(
        ".knowledge-page--item-workspace > .ui-page-header",
        responsiveStart
      ).get("grid-template-columns")
    ).toBe("minmax(0, 1fr)");

    const railStart = stylesheet.indexOf(
      "@media (max-width: 1180px)",
      professionalWorkspaceStart
    );
    expect(railStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(".knowledge-workspace-layout", railStart).get(
        "grid-template-columns"
      )
    ).toBe("minmax(0, 1fr)");
    const stackedHistory = declarations(
      ".knowledge-workspace-history-rail",
      railStart
    );
    expect(stackedHistory.get("position")).toBe("static");
    expect(stackedHistory.get("max-inline-size")).toBe("none");
    const overflowCue = declarations(
      ".knowledge-section-tabs-shell::after",
      railStart
    );
    expect(overflowCue.get("content")).toBe('"›"');
    expect(overflowCue.get("background")).toContain("var(--role-deck-tint");
    expect(overflowCue.get("border-inline-start")).toContain("var(--role-line");
    expect(overflowCue.get("pointer-events")).toBe("none");
    expect(overflowCue.get("background")).not.toContain("gradient");

    const overviewStart = stylesheet.indexOf("@media (max-width: 768px)");
    expect(overviewStart).toBeGreaterThan(-1);
    expect(
      declarations(
        ".knowledge-overview__configured-grid",
        overviewStart
      ).get("grid-template-columns")
    ).toBe("minmax(0, 1fr)");

    const selectorStart = stylesheet.indexOf(
      "@media (max-width: 768px)",
      professionalWorkspaceStart
    );
    expect(selectorStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(".knowledge-section-tabs-shell", selectorStart).get("display")
    ).toBe("none");
    expect(
      declarations(".knowledge-section-select", selectorStart).get("display")
    ).toBe("block");
    expect(
      declarations(".knowledge-section-command-bar", selectorStart).get("position")
    ).toBe("static");
    expect(
      declarations(".knowledge-workspace-status", selectorStart).get(
        "grid-template-columns"
      )
    ).toBe("minmax(0, 1fr)");
    expect(
      declarations(
        ".knowledge-page--item-workspace > .ui-page-header .ui-button--destructive-outline",
        selectorStart
      ).get("margin-inline-start")
    ).toBe("0");
  });

  it("keeps coarse targets large and removes item-workspace motion when requested", () => {
    const coarseStart = stylesheet.indexOf(
      "@media (pointer: coarse)",
      professionalWorkspaceStart
    );
    expect(coarseStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-section-tab",
        coarseStart
      ).get("min-block-size")
    ).toBe("44px");

    const reducedMotionStart = stylesheet.indexOf(
      "@media (prefers-reduced-motion: reduce)",
      professionalWorkspaceStart
    );
    expect(reducedMotionStart).toBeGreaterThan(professionalWorkspaceStart);
    expect(
      declarations(
        ".knowledge-page--item-workspace .knowledge-section-tab",
        reducedMotionStart
      ).get("transition")
    ).toBe("none");
  });
});
