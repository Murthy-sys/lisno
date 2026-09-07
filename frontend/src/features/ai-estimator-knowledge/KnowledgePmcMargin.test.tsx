import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeConfigurationBuilder } from "./KnowledgeModeConfigurationBuilder";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

function Harness({ initial = {}, readOnly = false, onChange = vi.fn(), onValidationChange = vi.fn() }: {
  initial?: KnowledgeJsonObject; readOnly?: boolean;
  onChange?: (payload: KnowledgeJsonObject) => void; onValidationChange?: (valid: boolean) => void;
}) {
  const [payload, setPayload] = useState(initial);
  return <main><KnowledgeModeConfigurationBuilder mainLineName="TV Unit" payload={payload} modes={[]}
    readOnly={readOnly} validationAttempt={0} onDirty={vi.fn()} onValidationChange={onValidationChange}
    onChange={(next) => { setPayload(next); onChange(next); }} /></main>;
}

describe("PMC Margin", () => {
  it("shows the margin range as plain text beside the main line when PMC is visible", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const margin = within(screen.getByText("PMC for TV Unit").parentElement!).getByText("PMC Margin (10%–20%)");
    expect(margin).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "PMC Margin (%)" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(margin).not.toBeVisible();
    await userEvent.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(margin).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows plain text in read-only revisions and retains saved values in conflict review", () => {
    const onChange = vi.fn();
    const view = render(<Harness initial={{ pmcMarginBps: 2_000 }} readOnly onChange={onChange} />);
    expect(screen.getByText("PMC Margin (10%–20%)")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "PMC Margin (%)" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    view.unmount();
    render(<KnowledgeConflictReview sectionKey="advanced" payload={{ pmcMarginBps: 1_250 }}
      localVersion={1} serverVersion={2} masters={{}} relationshipBaskets={[]} relationshipItems={[]} />);
    expect(screen.getByText("PMC Margin")).toBeVisible();
    expect(screen.getByText("12.50%")).toBeVisible();
  });
});
