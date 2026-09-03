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
import { KNOWLEDGE_WORKSPACE_SECTION_LABELS } from "./knowledgePresentation";
import {
  KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS,
  KNOWLEDGE_WORKSPACE_SECTION_KEYS,
  type KnowledgeWorkspaceSectionKey
} from "./knowledgeWorkspaceSections";

function SectionHarness({
  disabledSections,
  panelBusy = false
}: {
  readonly disabledSections?: readonly KnowledgeWorkspaceSectionKey[];
  readonly panelBusy?: boolean;
}) {
  const [section, setSection] =
    useState<KnowledgeWorkspaceSectionKey>("overview");
  return (
    <KnowledgeSectionNavigation
      activeSection={section}
      onSectionChange={setSection}
      disabledSections={disabledSections}
      panelBusy={panelBusy}
    >
      <h2>{KNOWLEDGE_WORKSPACE_SECTION_LABELS[section]} settings</h2>
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
      "Knowledge-base changes do not modify current estimates or the existing Estimator/Sales builder."
    );
  });

  it("renders the four workspace sections with associated roving tabs and a labelled mobile selector", async () => {
    const user = userEvent.setup();
    render(<SectionHarness />);

    expect(KNOWLEDGE_WORKSPACE_SECTION_KEYS).toEqual([
      "overview",
      "mode",
      "recommendations",
      "quality"
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
      "Recommendation & Exclusions",
      "Quality Parameter"
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
      "Recommendation & Exclusions",
      "Quality Parameter"
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
    const quality = screen.getByRole("tab", { name: "Quality Parameter" });
    expect(quality).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(overview).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(quality).toHaveFocus();
    await user.keyboard("{Home}");
    expect(overview).toHaveFocus();

    await user.selectOptions(selector, "recommendations");
    expect(screen.getByRole("tab", { name: "Recommendation & Exclusions" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(panel).toHaveAccessibleName("Recommendation & Exclusions");
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
    expect(screen.getByRole("tab", { name: "Recommendation & Exclusions" })).toHaveFocus();
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
