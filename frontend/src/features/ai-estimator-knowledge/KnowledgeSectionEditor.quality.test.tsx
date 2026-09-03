import { useState } from "react";

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
  it("accepts commas and spaces while typing allowed values", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness initialPayload={{
      parameters: [{
        id: "quality-1",
        type: "radio",
        label: "Is Needed",
        allowedValues: [],
        required: true,
        active: true
      }]
    }} />);

    const allowed = screen.getByRole("textbox", { name: "Allowed values" });
    await user.type(allowed, "Yes, No");

    /* The separator the author is still typing must survive: the payload holds
       a trimmed array while the field keeps the text exactly as entered. */
    expect(allowed).toHaveValue("Yes, No");
    expect(currentParameter().allowedValues).toEqual(["Yes", "No"]);

    await user.type(allowed, ", Maybe");
    expect(allowed).toHaveValue("Yes, No, Maybe");
    expect(currentParameter().allowedValues).toEqual(["Yes", "No", "Maybe"]);
  });

  it("gives a new parameter the flags its checkboxes already show", async () => {
    const user = userEvent.setup();
    render(<QualityEditorHarness />);

    await user.click(screen.getByRole("button", { name: "Add Quality parameter" }));

    /* Active renders ticked, so it has to be saved that way rather than being
       omitted and rejected by the section contract. */
    expect(screen.getByRole("checkbox", { name: "Active" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Required" })).not.toBeChecked();
    expect(currentParameter()).toMatchObject({ required: false, active: true });
  });

  it("omits every mutation control in a read-only revision", () => {
    render(<QualityEditorHarness readOnly initialPayload={{
      parameters: [
        { id: "quality-1", type: "text", label: "Notes", required: false, active: true },
        { id: "quality-2", type: "text", label: "Finish", required: false, active: true }
      ]
    }} />);

    expect(screen.queryByRole("button", { name: "Add Quality parameter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove Quality parameters/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Move Quality parameters/u })).not.toBeInTheDocument();
    for (const label of screen.getAllByRole("textbox", { name: "Label" })) {
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
      screen.getByRole("combobox", { name: "Parameter type" }),
      "radio"
    );

    const parameter = currentParameter();
    expect(parameter).not.toHaveProperty("unit");
    expect(parameter).not.toHaveProperty("minimum");
    expect(parameter).not.toHaveProperty("maximum");
    expect(screen.queryByRole("textbox", { name: "Unit" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Allowed values" })).toHaveValue("");
  });
});
