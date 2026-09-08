import { useState } from "react";
import axe from "axe-core";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import type { KnowledgeJsonObject } from "./knowledgeTypes";

function QualityEditorHarness({
  initialPayload = {},
  readOnly = false,
  readOnlyRevision
}: {
  readonly initialPayload?: KnowledgeJsonObject;
  readonly readOnly?: boolean;
  readonly readOnlyRevision?: boolean;
}) {
  const [payload, setPayload] = useState<KnowledgeJsonObject>(initialPayload);

  return (
    <main>
      <KnowledgeSectionEditor
        sectionKey="quality"
        payload={payload}
        masters={{}}
        relationshipBaskets={[]}
        relationshipItems={[]}
        currentMainLineId="line-1"
        readOnly={readOnly}
        readOnlyRevision={readOnlyRevision}
        canQuickAdd={false}
        resetKey="quality-editable"
        onChange={setPayload}
        onDirty={() => undefined}
        onValidationChange={() => undefined}
        onQuickAdd={() => undefined}
      />
      <output data-testid="quality-payload">{JSON.stringify(payload)}</output>
    </main>
  );
}

function currentParameter(): Record<string, unknown> {
  const payload = JSON.parse(
    screen.getByTestId("quality-payload").textContent ?? "{}"
  ) as { parameters?: Array<Record<string, unknown>> };
  return payload.parameters?.[0] ?? {};
}

describe("knowledge Quality editor", () => {
  it("shows only essential controls and preserves existing detailed settings when editing criteria", async () => {
    const previous: KnowledgeJsonObject = {
      id: "quality-previous", label: "Is the board thickness acceptable?", type: "number",
      unit: "mm", minimum: "6", maximum: "18", defaultValue: "12",
      stage: "Before closing", instructions: "Measure three locations.", checkMethod: "measurement",
      severity: "major", responsibleRole: "Site engineer", failureAction: "Rectify and recheck.",
      sampling: { method: "percentage", value: 10, unit: "installed boards" },
      evidence: { photos: true, documents: true, video: false, minPhotosPerSample: 3, instructions: "Show the measuring scale." }
    };
    const user = userEvent.setup();
    render(<QualityEditorHarness initialPayload={{ parameters: [previous] }} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Answer type" })).toHaveValue("number");
    expect(screen.getByRole("checkbox", { name: "Photo evidence" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Required photos" })).toHaveValue(3);
    expect(screen.queryByText("Sampling and evidence")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Default value")).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Acceptance criteria" }), "Matches approved board thickness.");
    expect(currentParameter()).toMatchObject({ ...previous, acceptanceCriteria: "Matches approved board thickness.", required: true, active: true });
    expect(previous).not.toHaveProperty("acceptanceCriteria");
  });

  it("configures single or multiple photos and preserves the count when toggled off and on", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness initialPayload={{ parameters: [{
      id: "photo-check", label: "Are the joints flush?", type: "boolean",
      evidence: { photos: false, documents: true, video: false, instructions: "Show every joint." }
    }] }} />);
    const photoToggle = screen.getByRole("checkbox", { name: "Photo evidence" });
    expect(screen.queryByRole("spinbutton", { name: "Required photos" })).not.toBeInTheDocument();
    await user.click(photoToggle);
    const count = screen.getByRole("spinbutton", { name: "Required photos" });
    expect(count).toHaveValue(1);
    await user.clear(count);
    await user.type(count, "4");
    expect(currentParameter().evidence).toEqual({ photos: true, documents: true, video: false, instructions: "Show every joint.", minPhotosPerSample: 4 });
    await user.click(photoToggle);
    expect(currentParameter().evidence).toMatchObject({ photos: false, minPhotosPerSample: null, documents: true });
    expect(screen.queryByRole("spinbutton", { name: "Required photos" })).not.toBeInTheDocument();
    await user.click(photoToggle);
    expect(screen.getByRole("spinbutton", { name: "Required photos" })).toHaveValue(4);
    const accessibility = await axe.run(screen.getByRole("main"), { rules: { "color-contrast": { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });

  it("clears an obsolete saved default when its option is removed", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness initialPayload={{ parameters: [{
      id: "quality-choice", label: "Finish", type: "dropdown", allowedValues: ["Pass", "Fail"], defaultValue: "Pass"
    }] }} />);
    const options = screen.getByRole("textbox", { name: "Options" });
    await user.clear(options);
    await user.type(options, "Acceptable, Needs rework");
    expect(currentParameter()).toMatchObject({ allowedValues: ["Acceptable", "Needs rework"], defaultValue: null });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts commas and spaces while typing allowed values", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness initialPayload={{
      parameters: [{
        id: "quality-1",
        type: "radio",
        label: "Is Needed",
        category: "Previous classification",
        allowedValues: [],
        required: true,
        active: true
      }]
    }} />);

    const allowed = screen.getByRole("textbox", { name: "Options" });
    expect(screen.queryByRole("textbox", { name: "Category" })).not.toBeInTheDocument();
    await user.type(allowed, "Yes, No");

    /* The separator the author is still typing must survive: the payload holds
       a trimmed array while the field keeps the text exactly as entered. */
    expect(allowed).toHaveValue("Yes, No");
    expect(currentParameter().allowedValues).toEqual(["Yes", "No"]);

    await user.type(allowed, ", Maybe");
    expect(allowed).toHaveValue("Yes, No, Maybe");
    expect(currentParameter().allowedValues).toEqual(["Yes", "No", "Maybe"]);
    expect(currentParameter().category).toBe("Previous classification");
  });

  it("makes every new parameter mandatory and active without showing flag checkboxes", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Add Quality parameter" }));

    expect(screen.queryByRole("checkbox", { name: "Active" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Required" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Category" })).not.toBeInTheDocument();
    expect(currentParameter()).not.toHaveProperty("category");
    expect(currentParameter()).toMatchObject({ required: true, active: true });
    const accessibility = await axe.run(screen.getByRole("main"), { rules: { "color-contrast": { enabled: false } } });
    expect(accessibility.violations).toEqual([]);
  });

  it("omits every mutation control in a read-only revision", () => {
    render(<QualityEditorHarness readOnly initialPayload={{
      parameters: [
        { id: "quality-1", type: "text", label: "Notes", required: false, active: true, evidence: { photos: true, documents: false, video: false, minPhotosPerSample: 3 } },
        { id: "quality-2", type: "text", label: "Finish", required: false, active: true }
      ]
    }} />);

    expect(screen.queryByRole("button", { name: "Add Quality parameter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove Quality parameters/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Move Quality parameters/u })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Required photos" })).toBeDisabled();
    for (const label of screen.getAllByRole("textbox", { name: "Question / check" })) {
      expect(label).toBeDisabled();
    }
  });

  it("keeps mutation controls mounted but disabled while an editable Draft saves", () => {
    /* A save in flight also sets readOnly. Hiding the controls then would make
       them disappear and reappear on every save, so they only dim. */
    render(<QualityEditorHarness readOnly readOnlyRevision={false} initialPayload={{
      parameters: [
        { id: "quality-1", type: "text", label: "Notes", required: false, active: true },
        { id: "quality-2", type: "text", label: "Finish", required: false, active: true }
      ]
    }} />);

    expect(screen.getByRole("button", { name: "Add Quality parameter" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^Remove Quality parameters/u })[0]).toBeDisabled();
  });

  it("keeps only the fields the chosen parameter type uses", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness initialPayload={{
      parameters: [{
        id: "quality-1",
        type: "number",
        label: "Thickness",
        unit: "mm",
        minimum: "6",
        maximum: "18",
        required: false,
        active: true
      }]
    }} />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Answer type" }),
      "radio"
    );

    const parameter = currentParameter();
    expect(parameter).not.toHaveProperty("unit");
    expect(parameter).not.toHaveProperty("minimum");
    expect(parameter).not.toHaveProperty("maximum");
    expect(screen.queryByRole("textbox", { name: "Unit" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Options" })).toHaveValue("");
  });
});
