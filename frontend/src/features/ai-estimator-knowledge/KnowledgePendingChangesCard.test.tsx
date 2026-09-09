import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { KnowledgePendingChangesCard } from "./KnowledgePendingChangesCard";
import type { KnowledgePendingChangesSnapshot } from "./knowledgePendingChanges";

const snapshot: KnowledgePendingChangesSnapshot = {
  sourceKey: "session-one",
  groups: [{ key: "specifications", label: "Specifications", entries: Array.from({ length: 6 }, (_, index) => ({
    key: String(index), title: `Specification ${index + 1}`, kind: "updated", fields: [{ key: "description", label: "Description", value: `Changed requirement ${index + 1}` }]
  })) }]
};

describe("Now requesting card", () => {
  it("renders nothing for an empty draft", () => {
    render(<KnowledgePendingChangesCard snapshot={{ sourceKey: "clean", groups: [] }} sectionLabel="Mode" />);
    expect(screen.queryByRole("region", { name: "Now requesting" })).not.toBeInTheDocument();
  });
  it("shows four entries, expands by keyboard and resets for another session", async () => {
    const user = userEvent.setup();
    const view = render(<KnowledgePendingChangesCard snapshot={snapshot} sectionLabel="Mode" />);
    const card = screen.getByRole("region", { name: "Now requesting" });
    expect(within(card).getAllByRole("heading", { level: 4 })).toHaveLength(4);
    const toggle = screen.getByRole("button", { name: "Show all 6 changes" });
    toggle.focus(); await user.keyboard("{Enter}");
    expect(within(card).getAllByRole("heading", { level: 4 })).toHaveLength(6);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    view.rerender(<KnowledgePendingChangesCard snapshot={{ ...snapshot, sourceKey: "session-two" }} sectionLabel="Mode" />);
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(4);
  });
  it("discloses the full pending value and preserves input focus on updates", async () => {
    const user = userEvent.setup();
    const value = `${"Changed requirement. ".repeat(12)}Final detail.`;
    const entry = { key: "a", title: "Ceiling finish", kind: "updated" as const, fields: [{ key: "reason", label: "Reason", value }] };
    const data = { sourceKey: "one", groups: [{ key: "a", label: "Scope changes", entries: [entry] }] };
    const renderCard = (current: typeof data) => <><input aria-label="Editor input" /><KnowledgePendingChangesCard snapshot={current} sectionLabel="Recommendation & Exclusions" /></>;
    const view = render(renderCard(data));
    expect(screen.queryByText(value)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show full value: Ceiling finish: Reason" }));
    expect(screen.getByText(value)).toBeVisible();
    screen.getByRole("textbox", { name: "Editor input" }).focus();
    view.rerender(renderCard({ ...data, groups: [{ ...data.groups[0]!, entries: [{ ...entry, fields: [{ ...entry.fields[0]!, value: `${value} Updated` }] }] }] }));
    expect(screen.getByRole("textbox", { name: "Editor input" })).toHaveFocus();
  });
  it("labels incomplete, removed, cleared and saving states without old values", () => {
    render(<KnowledgePendingChangesCard saving sectionLabel="Quality Parameter" snapshot={{ sourceKey: "quality", groups: [{ key: "q", label: "Shared checklist · Electrical", entries: [
      { key: "a", title: "Added check", kind: "added", incomplete: true, fields: [] },
      { key: "b", title: "Removed check", kind: "removed", fields: [] },
      { key: "c", title: "Photo check", kind: "updated", fields: [{ key: "acceptance", label: "Acceptance criteria", value: "", cleared: true }] }
    ] }] }} />);
    expect(screen.getByText("Saving…")).toBeVisible();
    expect(screen.getByText("Incomplete")).toBeVisible();
    expect(screen.getByText("Removed")).toBeVisible();
    expect(screen.getByText("Cleared")).toBeVisible();
  });
  it("has no scoped accessibility violations", async () => {
    const { container } = render(<KnowledgePendingChangesCard snapshot={snapshot} sectionLabel="Mode" />);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
