import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Field, Input } from "../../components/ui/Field";
import { KnowledgeLifecycleDialog } from "./KnowledgeLifecycleDialogs";
import { KnowledgeQuickAddDialog } from "./KnowledgeQuickAddDialog";
import { KnowledgeRepeater } from "./KnowledgeRepeater";
import { KnowledgeSafetyNotice } from "./KnowledgeSafetyNotice";
import { KnowledgeSectionNavigation } from "./KnowledgeSectionNavigation";
import { KnowledgeUnsavedChangesDialog } from "./KnowledgeUnsavedChangesDialog";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import {
  KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS,
  KNOWLEDGE_WORKSPACE_SECTION_KEYS,
  KNOWLEDGE_WORKSPACE_TAB_KEYS,
  KNOWLEDGE_WORKSPACE_TAB_LABELS,
  knowledgeWorkspaceSectionsForTiers,
  type KnowledgeWorkspaceTabKey
} from "./knowledgeWorkspaceSections";

function SectionHarness({
  disabledSections,
  sections,
  panelBusy = false
}: {
  readonly disabledSections?: readonly KnowledgeWorkspaceTabKey[];
  readonly sections?: readonly KnowledgeWorkspaceTabKey[];
  readonly panelBusy?: boolean;
}) {
  const [section, setSection] =
    useState<KnowledgeWorkspaceTabKey>("overview");
  return (
    <KnowledgeSectionNavigation
      activeSection={section}
      onSectionChange={setSection}
      disabledSections={disabledSections}
      sections={sections}
      panelBusy={panelBusy}
    >
      <h2>{KNOWLEDGE_WORKSPACE_TAB_LABELS[section]} settings</h2>
    </KnowledgeSectionNavigation>
  );
}

function RepeaterHarness() {
  const [items, setItems] = useState([{ id: "row-1", label: "Primer" }]);
  return (
    <KnowledgeRepeater
      label="Execution steps"
      addLabel="Add step"
      items={items}
      renderItem={(item) => <span>{item.label}</span>}
      onAdd={() =>
        setItems((current) => [
          ...current,
          { id: `row-${current.length + 1}`, label: `Step ${current.length + 1}` }
        ])
      }
      onRemove={(itemId) =>
        setItems((current) => current.filter(({ id }) => id !== itemId))
      }
      onMove={(itemId, direction) => {
        setItems((current) => {
          const from = current.findIndex(({ id }) => id === itemId);
          const to = direction === "up" ? from - 1 : from + 1;
          if (from < 0 || to < 0 || to >= current.length) return current;
          const next = [...current];
          [next[from], next[to]] = [next[to], next[from]];
          return next;
        });
      }}
    />
  );
}

describe("knowledge feature foundation", () => {
  it("keeps the existing-estimator isolation notice persistent and explicit", () => {
    render(<KnowledgeSafetyNotice />);

    expect(
      screen.getByRole("region", { name: "Knowledge base isolation notice" })
    ).toHaveTextContent(
      "Configuration updates apply to current selections. Published estimates and approvals keep their recorded values."
    );
  });

  it("renders default and selected Signature modes with associated roving tabs and a labelled mobile selector", async () => {
    const user = userEvent.setup();
    render(<SectionHarness />);

    expect(KNOWLEDGE_WORKSPACE_SECTION_KEYS).toEqual([
      "overview",
      "mode",
      "recommendations",
      "quality"
    ]);
    expect(KNOWLEDGE_WORKSPACE_TAB_KEYS).toEqual([
      "overview", "mode", "signature-mode", "premium-mode", "functional-mode", "recommendations", "quality", "design", "basket-closure-priority"
    ]);
    expect(Object.keys(KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS)).toEqual([
      "overview",
      "mode",
      "recommendations",
      "quality"
    ]);

    const tablist = screen.getByRole("tablist", {
      name: "Configuration sections"
    });
    expect(tablist.parentElement).toHaveClass("knowledge-section-tabs-shell");
    expect(
      within(tablist).getAllByRole("tab").map((tab) => tab.textContent)
    ).toEqual([
      "Overview",
      "Mode",
      "Signature Mode",
      "Recommendation & Exclusions",
      "Quality Parameter",
      "Design",
      "Basket closure priority"
    ]);
    expect(
      within(tablist).queryByRole("tab", { name: "Pricing" })
    ).not.toBeInTheDocument();
    expect(
      within(tablist).queryByRole("tab", { name: "Quantity & margin" })
    ).not.toBeInTheDocument();

    const selector = screen.getByRole("combobox", {
      name: "Configuration section"
    });
    expect(
      within(selector).getAllByRole("option").map((option) => option.textContent)
    ).toEqual([
      "Overview",
      "Mode",
      "Signature Mode",
      "Recommendation & Exclusions",
      "Quality Parameter",
      "Design",
      "Basket closure priority"
    ]);

    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    await user.keyboard("{ArrowRight}");

    const mode = screen.getByRole("tab", { name: "Mode" });
    const panel = screen.getByRole("tabpanel");
    expect(mode).toHaveFocus();
    expect(mode).toHaveAttribute("aria-selected", "true");
    expect(mode).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", mode.id);
    expect(panel).toHaveAccessibleName("Mode");
    expect(screen.getByRole("heading", { name: "Mode settings" })).toBeVisible();
    expect(panel).not.toHaveAttribute("aria-busy");

    await user.keyboard("{End}");
    const closurePriority = screen.getByRole("tab", { name: "Basket closure priority" });
    expect(closurePriority).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(overview).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(closurePriority).toHaveFocus();
    await user.keyboard("{Home}");
    expect(overview).toHaveFocus();

    await user.selectOptions(selector, "design");
    expect(screen.getByRole("tab", { name: "Design" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(panel).toHaveAccessibleName("Design");
    await user.selectOptions(selector, "basket-closure-priority");
    expect(panel).toHaveAccessibleName("Basket closure priority");
  });

  it("keeps default Mode alongside optional tiers in desktop and mobile navigation", async () => {
    const user = userEvent.setup();
    const sections = knowledgeWorkspaceSectionsForTiers(["signature", "premium", "functional"]);
    render(<SectionHarness sections={sections} />);
    expect(screen.getByRole("tab", { name: "Mode" })).toBeVisible();
    expect(within(screen.getByRole("tablist")).getAllByRole("tab").slice(0, 5).map(tab => tab.textContent))
      .toEqual(["Overview", "Mode", "Signature Mode", "Premium Mode", "Functional Mode"]);
    screen.getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mode" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Signature Mode" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Premium Mode" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tabpanel", { name: "Functional Mode" })).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Configuration section" }), "premium-mode");
    expect(screen.getByRole("tabpanel", { name: "Premium Mode" })).toBeVisible();
    expect(knowledgeWorkspaceSectionsForTiers([])).toEqual(["overview", "mode", "recommendations", "quality", "design", "basket-closure-priority"]);
  });

  it("keeps selected-section activation a no-op unless the consumer opts into a return action", async () => {
    const user = userEvent.setup(); const change = vi.fn(); const activate = vi.fn();
    const props = { activeSection: "mode" as const, sections: ["overview", "mode"] as const, onSectionChange: change, children: <p>Mode editor</p> };
    const view = render(<KnowledgeSectionNavigation {...props} />);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Return to Mode" })).not.toBeInTheDocument();
    view.rerender(<KnowledgeSectionNavigation {...props} onActiveSectionActivate={activate} />);
    await user.click(screen.getByRole("tab", { name: "Mode" }));
    expect(activate).toHaveBeenCalledTimes(1);
    const mobileReturn = screen.getByRole("button", { name: "Return to Mode" });
    expect(mobileReturn).toHaveTextContent("Mode");
    await user.click(mobileReturn);
    expect(activate).toHaveBeenCalledTimes(2);
    screen.getByRole("tab", { name: "Mode" }).focus();
    await user.keyboard(" ");
    expect(activate).toHaveBeenCalledTimes(3);
    expect(change).not.toHaveBeenCalled();
  });

  it("gives unselected tier navigation a keyboard entry point and placeholder without an orphaned tabpanel", async () => {
    function TierHarness() {
      const [active, setActive] = useState<KnowledgeWorkspaceTabKey>("mode");
      return <KnowledgeSectionNavigation activeSection={active} onSectionChange={setActive}
        sections={["signature-mode", "premium-mode", "functional-mode"]} navigationLabel="Mode selection" selectLabel="Configuration mode">
        <p>Selected editor: {active}</p>
      </KnowledgeSectionNavigation>;
    }
    const user = userEvent.setup(); render(<TierHarness />);
    const tiers = screen.getByRole("tablist", { name: "Mode selection" });
    expect(within(tiers).getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Signature Mode", "Premium Mode", "Functional Mode"]);
    expect(within(tiers).getAllByRole("tab").every(tab => tab.getAttribute("aria-selected") === "false")).toBe(true);
    const signature = within(tiers).getByRole("tab", { name: "Signature Mode" });
    expect(signature).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Premium Mode" })).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    const editor = screen.getByText("Selected editor: mode").closest("section")!;
    expect(editor).not.toHaveAttribute("aria-labelledby");
    const select = screen.getByRole("combobox", { name: "Configuration mode" });
    expect(select).toHaveValue("");
    expect(within(select).getByRole("option", { name: "Choose a tier" })).toBeDisabled();
    expect(within(select).queryByRole("option", { name: "Default Mode" })).not.toBeInTheDocument();
    signature.focus(); await user.keyboard("{Enter}");
    expect(signature).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Signature Mode" })).toBeVisible();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Functional Mode" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Functional Mode" })).toBeVisible();
    await user.selectOptions(select, "premium-mode");
    expect(screen.getByRole("tabpanel", { name: "Premium Mode" })).toBeVisible();
  });

  it("supports exclusive native mode radios with labelled regions and arrow-key navigation", async () => {
    function RadioHarness({ disabledSections = [] }: { disabledSections?: KnowledgeWorkspaceTabKey[] }) {
      const [active, setActive] = useState<KnowledgeWorkspaceTabKey>("mode");
      return <KnowledgeSectionNavigation variant="radios" activeSection={active} onSectionChange={setActive}
        sections={["signature-mode", "premium-mode", "functional-mode"]} disabledSections={disabledSections}
        navigationLabel="Mode selection" selectLabel="Configuration mode">
        <p>Selected editor: {active}</p>
      </KnowledgeSectionNavigation>;
    }
    const user = userEvent.setup(); const view = render(<RadioHarness />);
    const group = screen.getByRole("radiogroup", { name: "Mode selection" });
    const signature = within(group).getByRole("radio", { name: "Signature Mode" });
    const premium = within(group).getByRole("radio", { name: "Premium Mode" });
    const functional = within(group).getByRole("radio", { name: "Functional Mode" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(signature).toHaveAttribute("type", "radio");
    expect(signature).toHaveAttribute("tabindex", "0");
    expect(premium).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByText("Selected editor: mode").closest("section")).not.toHaveAttribute("aria-labelledby");
    signature.focus(); await user.keyboard(" ");
    const region = screen.getByRole("region", { name: "Signature Mode" });
    expect(signature).toHaveAttribute("aria-controls", region.id);
    await user.click(signature);
    await user.keyboard(" ");
    expect(signature).toBeChecked();
    expect(region).toHaveAccessibleName("Signature Mode");
    for (const [key, selected, name] of [
      ["{ArrowDown}", premium, "Premium Mode"], ["{ArrowRight}", functional, "Functional Mode"],
      ["{ArrowDown}", signature, "Signature Mode"], ["{ArrowUp}", functional, "Functional Mode"],
      ["{ArrowLeft}", premium, "Premium Mode"], ["{Home}", signature, "Signature Mode"],
      ["{End}", functional, "Functional Mode"]
    ] as const) {
      await user.keyboard(key);
      expect(selected).toHaveFocus();
      expect(within(group).getAllByRole("radio", { checked: true })).toEqual([selected]);
      expect(screen.getByRole("region", { name })).toBeVisible();
    }
    view.rerender(<RadioHarness disabledSections={["premium-mode"]} />);
    expect(premium).toBeDisabled();
    await user.keyboard("{Home}{ArrowDown}");
    expect(functional).toHaveFocus();
    expect(functional).toBeChecked();
    await user.keyboard("{ArrowUp}");
    expect(signature).toHaveFocus();
    expect(signature).toBeChecked();
  });

  it("allows an opted-in radio selection to be cleared by click or Space without clearing on arrow navigation", async () => {
    function ClearableRadioHarness() {
      const [active, setActive] = useState<KnowledgeWorkspaceTabKey>("mode");
      return <KnowledgeSectionNavigation variant="radios" activeSection={active} onSectionChange={setActive}
        onClearSelection={() => setActive("mode")} sections={["signature-mode", "premium-mode", "functional-mode"]}
        navigationLabel="Mode selection">
        <p>Selected editor: {active}</p>
      </KnowledgeSectionNavigation>;
    }
    const user = userEvent.setup(); render(<ClearableRadioHarness />);
    const group = screen.getByRole("radiogroup", { name: "Mode selection" });
    const signature = within(group).getByRole("radio", { name: "Signature Mode" });
    for (const action of ["click", "Space"]) {
      await user.click(signature);
      expect(signature).toBeChecked();
      expect(screen.getByRole("region", { name: "Signature Mode" })).toBeVisible();
      if (action === "click") await user.click(signature);
      else await user.keyboard(" ");
      expect(within(group).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
      expect(screen.getByText("Selected editor: mode")).toBeVisible();
      expect(screen.queryByRole("region")).not.toBeInTheDocument();
    }
    await user.click(signature);
    await user.keyboard("{Home}");
    expect(signature).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(within(group).getByRole("radio", { name: "Premium Mode" })).toBeChecked();
  });

  it("announces only the active panel as busy without changing tab ownership", () => {
    render(<SectionHarness panelBusy />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    const panel = screen.getByRole("tabpanel", { name: "Overview" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(overview).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", overview.id);
  });

  it("skips disabled workspace sections during keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<SectionHarness disabledSections={["mode"]} />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    const mode = screen.getByRole("tab", { name: "Mode" });
    expect(mode).toBeDisabled();
    expect(screen.getByRole("option", { name: "Mode" })).toBeDisabled();

    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Signature Mode" })).toHaveFocus();
  });

  it("adds, reorders, and removes repeater rows with predictable focus", async () => {
    const user = userEvent.setup();
    render(<RepeaterHarness />);

    await user.click(screen.getByRole("button", { name: "Add step" }));
    const addedRow = screen.getByText("Step 2").closest(".knowledge-repeater__row");
    await waitFor(() => expect(addedRow).toHaveFocus());

    await user.click(
      screen.getByRole("button", { name: "Move Execution steps entry 2 up" })
    );
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem")[0]
    ).toHaveTextContent("Step 2");

    await user.click(
      screen.getByRole("button", { name: "Remove Execution steps entry 1" })
    );
    const remainingRow = screen
      .getByText("Primer")
      .closest(".knowledge-repeater__row");
    await waitFor(() => expect(remainingRow).toHaveFocus());
  });

  it("retains local conflict choices and never replays a mutation automatically", async () => {
    const user = userEvent.setup();
    const review = vi.fn();
    const discard = vi.fn();
    const keep = vi.fn();
    render(
      <KnowledgeVersionConflictDialog
        localVersion={4}
        serverVersion={5}
        onReviewServerVersion={review}
        onDiscardLocalChanges={discard}
        onKeepEditing={keep}
      />
    );

    expect(screen.getByText(/local changes are still available/i)).toBeVisible();
    expect(review).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Review server version" }));
    expect(review).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
  });

  it("keeps blocked lifecycle actions disabled with the server reason visible", () => {
    render(
      <KnowledgeLifecycleDialog
        action="activate"
        blockers={[
          {
            code: "MISSING_UOM",
            sectionKey: "overview",
            message: "Select an active UOM.",
            blocking: true
          }
        ]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Select an active UOM.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Activate revision" })
    ).toBeDisabled();
  });

  it("preserves quick-add form content while reporting a failure", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(
      <KnowledgeQuickAddDialog
        title="Add vendor"
        submitLabel="Add vendor"
        error="The vendor could not be added."
        onSubmit={submit}
        onClose={vi.fn()}
      >
        <Field id="vendor-name" label="Vendor name">
          {(controlProps) => <Input {...controlProps} defaultValue="Acme" />}
        </Field>
      </KnowledgeQuickAddDialog>
    );

    expect(screen.getByRole("textbox", { name: "Vendor name" })).toHaveValue(
      "Acme"
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The vendor could not be added."
    );
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("offers all three explicit unsaved navigation choices", () => {
    render(
      <KnowledgeUnsavedChangesDialog
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onStay={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard changes" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Stay here" })).toBeVisible();
  });
});
