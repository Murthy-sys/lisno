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
import { KNOWLEDGE_SECTION_LABELS } from "./knowledgePresentation";
import type { KnowledgeSectionKey } from "./knowledgeTypes";

function SectionHarness() {
  const [section, setSection] = useState<KnowledgeSectionKey>("overview");
  return (
    <KnowledgeSectionNavigation
      activeSection={section}
      onSectionChange={setSection}
    >
      <h2>{KNOWLEDGE_SECTION_LABELS[section]} settings</h2>
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

  it("implements roving keyboard tabs and a labelled mobile section selector", async () => {
    const user = userEvent.setup();
    render(<SectionHarness />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    await user.keyboard("{ArrowRight}");

    const pricing = screen.getByRole("tab", { name: "Pricing" });
    expect(pricing).toHaveFocus();
    expect(pricing).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Pricing");
    expect(screen.getByRole("heading", { name: "Pricing settings" })).toBeVisible();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Configuration section" }),
      "execution"
    );
    expect(screen.getByRole("tab", { name: "Execution" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
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
