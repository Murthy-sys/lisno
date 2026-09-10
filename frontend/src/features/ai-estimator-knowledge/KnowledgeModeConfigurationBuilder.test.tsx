import { useState } from "react";
import axe from "axe-core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  KnowledgeModeConfigurationBuilder,
  type KnowledgeLegacyModeCatalogState
} from "./KnowledgeModeConfigurationBuilder";
import type { KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

const metadata = {
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z"
} as const;

function master(id: string, code: string, name: string): KnowledgeMaster {
  return {
    id,
    masterType: "modes",
    code,
    name,
    description: null,
    displayOrder: 10,
    status: "active",
    version: 1,
    ...metadata
  };
}

const legacyExecution = master(
  "mode-execution-asymmetric-id",
  "EXECUTION",
  "Legacy Execution"
);

function Harness({
  initialPayload = {},
  readOnly = false,
  modes = [],
  legacyModeCatalogState = { status: "ready" },
  serverIssues = [],
  onPayload = vi.fn(),
  onDirty = vi.fn(),
  onValidationChange = vi.fn()
}: {
  readonly initialPayload?: KnowledgeJsonObject;
  readonly readOnly?: boolean;
  readonly modes?: readonly KnowledgeMaster[];
  readonly legacyModeCatalogState?: KnowledgeLegacyModeCatalogState;
  readonly serverIssues?: readonly { readonly path: string; readonly message: string }[];
  readonly onPayload?: (payload: KnowledgeJsonObject) => void;
  readonly onDirty?: () => void;
  readonly onValidationChange?: (valid: boolean) => void;
}) {
  const [payload, setPayload] = useState(initialPayload);
  const [validationAttempt, setValidationAttempt] = useState(0);
  return (
    <main>
      <KnowledgeModeConfigurationBuilder
        payload={payload}
        mainLineName="Wall panelling"
        modes={modes}
        legacyModeCatalogState={legacyModeCatalogState}
        serverIssues={serverIssues}
        readOnly={readOnly}
        validationAttempt={validationAttempt}
        onChange={(next) => {
          setPayload(next);
          onPayload(next);
        }}
        onDirty={onDirty}
        onValidationChange={onValidationChange}
      />
      <output data-testid="mode-payload">{JSON.stringify(payload)}</output>
      <button type="button" onClick={() => setValidationAttempt((value) => value + 1)}>
        Attempt save
      </button>
    </main>
  );
}

const definitionPayload: KnowledgeJsonObject = {
  modeConfigurations: [
    {
      id: "configuration-definitions",
      modeKind: "execution",
      executionSource: "sub_vendor",
      fields: [
        { id: "field-text", type: "text", label: "PMC mark", options: [], value: "legacy answer" },
        { id: "field-textarea", type: "textarea", label: "Installation notes", options: [] },
        { id: "field-number", type: "number", label: "Crew factor", options: [] },
        { id: "field-radio", type: "radio", label: "Approval", options: ["Pending", "Approved"] },
        { id: "field-dropdown", type: "dropdown", label: "Finish", options: ["Matte", "Gloss"] },
        { id: "field-checkbox", type: "checkbox", label: "Safety required", options: [] }
      ]
    },
    {
      id: "configuration-pmc",
      modeKind: "pmc",
      fields: [{ id: "field-sub-vendor", type: "text", label: "Sub-Vendor scope", options: [] }]
    },
    {
      id: "configuration-in-house",
      modeKind: "execution",
      executionSource: "in_house",
      fields: [{ id: "field-in-house", type: "number", label: "In-house crew", options: [] }]
    }
  ]
};

describe("KnowledgeModeConfigurationBuilder", () => {
  it("renders Mode checkboxes and keeps PMC direct without an Execution source selector", async () => {
    render(<Harness />);

    expect(screen.queryByRole("combobox", { name: "Mode" })).not.toBeInTheDocument();
    const selector = screen.getByRole("group", { name: "Mode" });
    expect(within(selector).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(selector).getByRole("checkbox", { name: "PMC" })).toBeChecked();
    expect(within(selector).getByRole("checkbox", { name: "Execution" })).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "PMC components" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Execution source" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/each have separate calculation settings/u)).toBeVisible();
    expect(screen.getByText(/UOM and the paragraph are shared for this Main Line/u)).toBeVisible();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("shows each checked Mode independently and supports hiding both without editing saved data", async () => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    const onDirty = vi.fn();
    render(<Harness onPayload={onPayload} onDirty={onDirty} />);
    const pmc = screen.getByRole("checkbox", { name: "PMC" });
    const execution = screen.getByRole("checkbox", { name: "Execution" });
    expect(pmc).toHaveAccessibleDescription(/^PMC fee(?: for)? Wall panelling$/);
    execution.focus();
    await user.keyboard(" ");
    expect(pmc).toBeChecked();
    expect(execution).toBeChecked();
    expect(screen.getByRole("region", { name: "PMC" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Execution" })).toBeVisible();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(pmc);
    expect(screen.queryByText(/^PMC fee(?: for)? Wall panelling$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "PMC" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Execution" })).toBeVisible();
    await user.click(execution);
    expect(screen.queryByRole("region", { name: "Execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    await user.click(pmc);
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    expect(screen.getByText(/^PMC fee(?: for)? Wall panelling$/)).toBeVisible();
    expect(onPayload).not.toHaveBeenCalled();
    expect(onDirty).not.toHaveBeenCalled();
  });

  it.each([false, true])("supports independent keyboard collapse without changing selections or data (read-only: %s)", async (readOnly) => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    const onDirty = vi.fn();
    render(<Harness readOnly={readOnly} onPayload={onPayload} onDirty={onDirty} />);
    const pmcSelection = screen.getByRole("checkbox", { name: "PMC" });
    const executionSelection = screen.getByRole("checkbox", { name: "Execution" });
    await user.click(executionSelection);
    const pmcToggle = screen.getByRole("button", { name: "Collapse PMC" });
    const executionToggle = screen.getByRole("button", { name: "Collapse Execution" });
    const pmcBody = document.getElementById(pmcToggle.getAttribute("aria-controls")!);
    const executionBody = document.getElementById(executionToggle.getAttribute("aria-controls")!);
    expect(pmcBody).toContainElement(screen.getByRole("spinbutton", { name: "PMC Margin" }));
    expect(executionBody).toContainElement(screen.getByRole("group", { name: "Execution source" }));
    expect(pmcToggle).toBeEnabled();
    expect(executionToggle).toBeEnabled();

    pmcToggle.focus();
    await user.keyboard(" ");
    expect(pmcToggle).toHaveAccessibleName("Expand PMC");
    expect(pmcToggle).toHaveAttribute("aria-expanded", "false");
    expect(pmcBody).toHaveAttribute("hidden");
    expect(executionToggle).toHaveAttribute("aria-expanded", "true");
    expect(executionBody).toBeVisible();
    executionToggle.focus();
    await user.keyboard("{Enter}");
    expect(executionToggle).toHaveAccessibleName("Expand Execution");
    expect(executionToggle).toHaveAttribute("aria-expanded", "false");
    expect(executionBody).toHaveAttribute("hidden");
    expect(pmcSelection).toBeChecked();
    expect(executionSelection).toBeChecked();
    expect(screen.getByRole("heading", { name: "Shared description" })).toBeVisible();

    await user.keyboard(" ");
    expect(executionToggle).toHaveAttribute("aria-expanded", "true");
    expect(executionBody).toBeVisible();
    expect(pmcBody).not.toBeVisible();
    await user.click(pmcSelection);
    await user.click(pmcSelection);
    expect(screen.getByRole("button", { name: "Collapse PMC" })).toHaveAttribute("aria-expanded", "true");
    expect(pmcBody).toBeVisible();
    expect(onPayload).not.toHaveBeenCalled();
    expect(onDirty).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps both Execution sources independently selectable and keyboard collapsible (read-only: %s)", async (readOnly) => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    const onDirty = vi.fn();
    render(<Harness readOnly={readOnly} onPayload={onPayload} onDirty={onDirty} initialPayload={definitionPayload} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    const inHouseSelection = screen.getByRole("checkbox", { name: "In-house" });
    inHouseSelection.focus();
    await user.keyboard(" ");
    const subVendorSelection = screen.getByRole("checkbox", { name: "Sub-Vendor" });
    expect(subVendorSelection).toBeChecked();
    expect(inHouseSelection).toBeChecked();
    const subVendor = document.getElementById("knowledge-mode-body-sub_vendor")!;
    const inHouse = document.getElementById("knowledge-mode-body-in_house")!;
    expect(screen.queryByRole("region", { name: /components$/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(subVendor).toBeVisible();
    expect(inHouse).toBeVisible();
    const subVendorToggle = screen.getByRole("button", { name: "Collapse Sub-Vendor" });
    const inHouseToggle = screen.getByRole("button", { name: "Collapse In-house" });
    subVendorToggle.focus();
    await user.keyboard("{Enter}");
    expect(subVendorToggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(subVendorToggle.getAttribute("aria-controls")!)).toBe(subVendor);
    expect(subVendor).not.toBeVisible();
    expect(inHouse).toBeVisible();
    inHouseToggle.focus();
    await user.keyboard(" ");
    expect(inHouse).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Collapse Execution" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Collapse Execution" }));
    await user.click(screen.getByRole("button", { name: "Expand Execution" }));
    expect(subVendor).not.toBeVisible();
    expect(inHouse).not.toBeVisible();
    await user.click(subVendorSelection);
    await user.click(subVendorSelection);
    expect(subVendor).toBeVisible();
    expect(inHouse).not.toBeVisible();
    expect(inHouseSelection).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Expand In-house" }));
    expect(inHouse).toBeVisible();
    expect(onPayload).not.toHaveBeenCalled();
    expect(onDirty).not.toHaveBeenCalled();
  });

  it("reveals both collapsed Execution panels and focuses an invalid Sub-Vendor margin", async () => {
    const user = userEvent.setup();
    render(<Harness initialPayload={{ pmcMarginBps: 1_200, subVendorMarginBps: 1_700 }} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("checkbox", { name: "In-house" }));
    const margin = screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" });
    fireEvent.change(margin, { target: { value: "21" } });
    await user.click(screen.getByRole("button", { name: "Collapse Sub-Vendor" }));
    await user.click(screen.getByRole("button", { name: "Collapse In-house" }));
    await user.click(screen.getByRole("button", { name: "Collapse Execution" }));
    await user.click(screen.getByRole("button", { name: "Attempt save" }));
    await waitFor(() => expect(margin).toHaveFocus());
    expect(margin).toBeVisible();
    expect(margin).toHaveValue(21);
    expect(screen.getByRole("button", { name: "Collapse Execution" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Collapse Sub-Vendor" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Expand In-house" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(12);
  });

  it("preserves independent margins and Sub-Vendor scope while toggling sources", async () => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness onPayload={onPayload} />);

    await user.type(screen.getByRole("spinbutton", { name: "PMC Margin" }), "15");

    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" }));
    const sourceGroup = screen.getByRole("group", { name: "Execution source" });
    expect(within(sourceGroup).getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Execution" }))
      .toHaveAccessibleDescription("Execution (Sub-Vendor) for Wall panelling");
    expect(within(sourceGroup).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(sourceGroup).queryByRole("radio")).not.toBeInTheDocument();
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "17");
    await user.click(within(screen.getByRole("group", { name: "Exclusions" })).getByRole("checkbox", { name: "Shifting" }));

    within(sourceGroup).getByRole("checkbox", { name: "In-house" }).focus();
    await user.keyboard(" ");
    expect(within(sourceGroup).getByRole("checkbox", { name: "In-house" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Execution" }))
      .toHaveAccessibleDescription("Execution (Sub-Vendor + In-house) for Wall panelling");
    expect(within(sourceGroup).getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    expect(screen.getByRole("region", { name: "In-house" })).toBeVisible();

    expect(screen.getByRole("checkbox", { name: "Execution" }))
      .toHaveAccessibleDescription("Execution (Sub-Vendor + In-house) for Wall panelling");
    expect(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" })).toHaveValue(17);
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getByRole("spinbutton", { name: "PMC Margin" })).toHaveValue(15);
    expect(screen.queryByRole("group", { name: "Inclusions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Exclusions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    expect(within(screen.getByRole("group", { name: "Inclusions" })).getByRole("checkbox", { name: "Transport" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "In-house" })).toBeChecked();
    expect(screen.getByRole("region", { name: "In-house" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();

    const latest = onPayload.mock.calls.at(-1)?.[0] as KnowledgeJsonObject;
    expect(latest.pmcMarginBps).toBe(1_500);
    expect(latest.subVendorMarginBps).toBe(1_700);
    expect(latest.modeConfigurations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modeKind: "pmc",
        inclusions: expect.arrayContaining([expect.objectContaining({ name: "Transport", selected: true })]),
        exclusions: expect.arrayContaining([expect.objectContaining({ name: "Shifting", selected: true })])
      })
    ]));
    /* No value was entered in any buffer, so an unanswered component must not
       persist an empty answer key. */
    expect(JSON.stringify(latest.modeConfigurations)).not.toContain('"value"');
    expect(JSON.stringify(latest.modeConfigurations)).not.toContain("modeId");
  });

  it.each([false, true])("omits saved component sections and controls in both sources (read-only: %s)", async (readOnly) => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness initialPayload={definitionPayload} readOnly={readOnly} onPayload={onPayload} />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("checkbox", { name: "In-house" }));
    expect(screen.getByRole("region", { name: "Sub-Vendor" })).toBeVisible();
    expect(screen.getByRole("region", { name: "In-house" })).toBeVisible();
    expect(screen.queryByRole("region", { name: /components$/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Component label" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Component type" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("legacy answer")).not.toBeInTheDocument();
    expect(payload()).toEqual(definitionPayload);
    expect(screen.queryByRole("region", { name: "Saved Mode configurations needing recovery" })).not.toBeInTheDocument();
    expect(onPayload).not.toHaveBeenCalled();
  });

  it("preserves all stored component types, values, IDs, and ordering after independent margin edits", async () => {
    const user = userEvent.setup();
    render(<Harness initialPayload={definitionPayload} />);
    await user.type(screen.getByRole("spinbutton", { name: "PMC Margin" }), "15");
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.type(screen.getByRole("spinbutton", { name: "Sub-Vendor Margin" }), "17");
    expect(payload()).toEqual({ ...definitionPayload, pmcMarginBps: 1_500, subVendorMarginBps: 1_700 });
  });

  it("announces authoritative errors for retained historical fields without dropping them", async () => {
    const user = userEvent.setup();
    render(<Harness initialPayload={definitionPayload}
      serverIssues={[{ path: "modeConfigurations.0.fields.0.label", message: "Review the saved component label." }]} />);
    await user.click(screen.getByRole("button", { name: "Attempt save" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent("Review the saved component label.");
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeChecked();
    expect(payload()).toEqual(definitionPayload);
  });

  it.each([false, true])("keeps invalid retained Execution fields in explicit recovery without hiding validation (read-only: %s)", async (readOnly) => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    const onValidationChange = vi.fn();
    const validInHouse = (definitionPayload.modeConfigurations as KnowledgeJsonObject[])[2]!;
    const invalidSubVendor = {
      id: "invalid-sub-vendor", modeKind: "execution", executionSource: "sub_vendor",
      fields: [{ id: "legacy-choice", type: "dropdown", label: "Historic finish", options: [], value: null }]
    };
    const initialPayload = { pmcMarginBps: 1_200, subVendorMarginBps: 1_700,
      modeConfigurations: [invalidSubVendor, validInHouse] };
    render(<Harness initialPayload={initialPayload} readOnly={readOnly} onPayload={onPayload}
      onValidationChange={onValidationChange} />);
    const recovery = screen.getByRole("region", { name: "Saved Mode configurations needing recovery" });
    expect(recovery).toHaveTextContent("Historic finish");
    expect(recovery).not.toHaveTextContent("In-house crew");
    expect(recovery).toHaveTextContent("Calculation and margin settings are retained.");
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one allowed option.");
    expect(onValidationChange).toHaveBeenLastCalledWith(false);
    expect(payload()).toEqual(initialPayload);
    expect(onPayload).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
    if (readOnly) {
      expect(within(recovery).queryByRole("button", { name: "Remove saved Mode recovery 1" })).not.toBeInTheDocument();
      return;
    }
    await user.click(within(recovery).getByRole("button", { name: "Remove saved Mode recovery 1" }));
    expect(payload()).toEqual({ ...initialPayload, modeConfigurations: [validInHouse] });
    expect(screen.queryByRole("region", { name: "Saved Mode configurations needing recovery" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValidationChange).toHaveBeenLastCalledWith(true);
  });

  it.each(["inclusions", "exclusions"])("reveals Sub-Vendor scope for a saved %s validation issue", async (list) => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness
      initialPayload={{ modeConfigurations: [{ id: "saved-scope", modeKind: "pmc", fields: [] }] }}
      serverIssues={[{ path: `modeConfigurations.0.${list}`, message: "Review the saved scope list." }]}
      onPayload={onPayload}
    />);
    await user.click(screen.getByRole("checkbox", { name: "Execution" }));
    await user.click(screen.getByRole("checkbox", { name: "In-house" }));
    await user.click(screen.getByRole("button", { name: "Collapse Sub-Vendor" }));
    await user.click(screen.getByRole("checkbox", { name: "Sub-Vendor" }));
    await user.click(screen.getByRole("button", { name: "Collapse Execution" }));
    expect(screen.queryByRole("region", { name: "Sub-Vendor scope" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Attempt save" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Sub-Vendor scope" })).toBeVisible());
    expect(screen.getByRole("checkbox", { name: "Execution" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor" })).toBeChecked();
    expect(screen.getByRole("group", { name: list === "inclusions" ? "Inclusions" : "Exclusions" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Review the saved scope list.");
    expect(onPayload).not.toHaveBeenCalled();
  });

  it("moves unscoped Execution recovery only into an empty chosen source", async () => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness onPayload={onPayload} initialPayload={{
      serverOwnedExtension: { preserve: true },
      modeConfigurations: [
        {
          id: "configuration-sub-vendor",
          modeKind: "execution",
          executionSource: "sub_vendor",
          fields: [{ id: "field-sub", type: "text", label: "Sub work", options: [] }]
        },
        {
          id: "configuration-unscoped",
          modeKind: "execution",
          fields: [{ id: "field-unscoped", type: "dropdown", label: "Recovered work", options: ["A", "B"], value: "B" }]
        }
      ]
    }} />);

    const recovery = screen.getByRole("region", {
      name: "Saved Mode configurations needing recovery"
    });
    expect(within(recovery).queryByRole("button", { name: "Move to Sub-Vendor" }))
      .not.toBeInTheDocument();
    expect(within(recovery).getByRole("button", { name: "Move to In-house" }))
      .toBeEnabled();
    expect(recovery).toHaveTextContent("Move it to an empty Execution source");
    expect(recovery).toHaveTextContent("Recovered work");
    expect(recovery).toHaveTextContent("Dropdown · A, B");
    expect(recovery).toHaveTextContent("Value: B");

    await user.click(within(recovery).getByRole("button", { name: "Move to In-house" }));
    const latest = onPayload.mock.calls.at(-1)?.[0] as KnowledgeJsonObject;
    expect(latest).toMatchObject({ serverOwnedExtension: { preserve: true } });
    expect(latest.modeConfigurations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "configuration-unscoped",
        modeKind: "execution",
        executionSource: "in_house"
      })
    ]));
    expect(JSON.stringify(latest.modeConfigurations)).toContain('"value":"B"');
  });

  it("keeps legacy reusable rows explicit and removable without exposing internal IDs", async () => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness
      modes={[legacyExecution]}
      onPayload={onPayload}
      initialPayload={{
        modeConfigurations: [{
          id: "legacy-execution-configuration",
          modeId: legacyExecution.id,
          fields: [{
            id: "legacy-field",
            type: "text",
            label: "Legacy scope",
            options: [],
            value: "Private old answer"
          }]
        }]
      }}
    />);

    const recovery = screen.getByRole("region", {
      name: "Saved Mode configurations needing recovery"
    });
    expect(recovery).toHaveTextContent("Legacy scope");
    expect(recovery).toHaveTextContent("Value: Private old answer");
    expect(recovery).not.toHaveTextContent(legacyExecution.id);
    expect(within(recovery).queryByRole("button", { name: "Move to Sub-Vendor" }))
      .not.toBeInTheDocument();
    expect(within(recovery).queryByRole("button", { name: "Move to In-house" }))
      .not.toBeInTheDocument();
    expect(recovery).toHaveTextContent("Remove it from this Draft if it is no longer required");

    await user.click(within(recovery).getByRole("button", {
      name: "Remove saved Mode recovery 1"
    }));
    expect(onPayload.mock.calls.at(-1)?.[0]).toMatchObject({ modeConfigurations: [] });
  });
});

function payload(): KnowledgeJsonObject {
  return JSON.parse(screen.getByTestId("mode-payload").textContent ?? "{}") as KnowledgeJsonObject;
}
