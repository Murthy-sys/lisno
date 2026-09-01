import { useState } from "react";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
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
      id: "configuration-pmc",
      modeKind: "pmc",
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
      id: "configuration-sub-vendor",
      modeKind: "execution",
      executionSource: "sub_vendor",
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
  it("renders fixed Modes and keeps PMC direct without an Execution source selector", async () => {
    render(<Harness />);

    const selector = screen.getByRole("combobox", { name: "Mode" });
    expect(within(selector).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["PMC", "Execution"]);
    expect(screen.getByRole("region", { name: "PMC components" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add component" })).toBeEnabled();
    expect(screen.queryByRole("group", { name: "Execution source" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/Entered answers are not stored here/u)).toBeVisible();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("preserves independent PMC, Sub-Vendor, and In-house unsaved buffers", async () => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness onPayload={onPayload} />);

    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "PMC mark");

    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "execution");
    const sourceGroup = screen.getByRole("group", { name: "Execution source" });
    expect(within(sourceGroup).getByRole("radio", { name: "Sub-Vendor" })).toBeChecked();
    expect(within(sourceGroup).getAllByRole("radio")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ required: true }),
        expect.objectContaining({ required: true })
      ])
    );
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "Sub-Vendor scope");

    within(sourceGroup).getByRole("radio", { name: "Sub-Vendor" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(sourceGroup).getByRole("radio", { name: "In-house" })).toBeChecked();
    expect(screen.getByRole("region", { name: "In-house components" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.type(screen.getByRole("textbox", { name: "Component label" }), "In-house crew");

    await user.click(within(sourceGroup).getByRole("radio", { name: "Sub-Vendor" }));
    expect(screen.getByDisplayValue("Sub-Vendor scope")).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "pmc");
    expect(screen.getByDisplayValue("PMC mark")).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "execution");
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    expect(screen.getByDisplayValue("In-house crew")).toBeVisible();

    const latest = onPayload.mock.calls.at(-1)?.[0] as KnowledgeJsonObject;
    expect(latest.modeConfigurations).toEqual(expect.arrayContaining([
      expect.objectContaining({ modeKind: "pmc" }),
      expect.objectContaining({
        modeKind: "execution",
        executionSource: "sub_vendor"
      }),
      expect.objectContaining({
        modeKind: "execution",
        executionSource: "in_house"
      })
    ]));
    expect(JSON.stringify(latest.modeConfigurations)).not.toContain("value");
    expect(JSON.stringify(latest.modeConfigurations)).not.toContain("modeId");
  });

  it("renders six definition types without any answer or default controls", async () => {
    const user = userEvent.setup();
    render(<Harness initialPayload={definitionPayload} />);

    expect(screen.getAllByRole("combobox", { name: "Component type" })).toHaveLength(6);
    expect(screen.getAllByRole("textbox", { name: "Component label" })).toHaveLength(6);
    expect(screen.getAllByRole("textbox", { name: "Allowed options" })).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: "PMC mark" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Safety required" })).not.toBeInTheDocument();
    expect(screen.queryByText("legacy answer")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("saved value was cleared");

    await user.selectOptions(
      screen.getAllByRole("combobox", { name: "Component type" })[0]!,
      "dropdown"
    );
    expect(screen.getAllByRole("textbox", { name: "Allowed options" })).toHaveLength(3);
    expect(JSON.stringify(payload())).not.toContain("value");
  });

  it("reorders and removes definitions while retaining stable component IDs", async () => {
    const user = userEvent.setup();
    const onPayload = vi.fn();
    render(<Harness initialPayload={definitionPayload} onPayload={onPayload} />);

    await user.click(screen.getByRole("button", {
      name: "Move PMC components PMC mark down"
    }));
    let latest = onPayload.mock.calls.at(-1)?.[0] as KnowledgeJsonObject;
    expect(latest.modeConfigurations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modeKind: "pmc",
        fields: expect.arrayContaining([
          expect.objectContaining({ id: "field-text", label: "PMC mark" }),
          expect.objectContaining({ id: "field-textarea", label: "Installation notes" })
        ])
      })
    ]));
    expect((latest.modeConfigurations as KnowledgeJsonObject[])[0]?.fields)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "field-textarea" }),
        expect.objectContaining({ id: "field-text" })
      ]));
    expect(((latest.modeConfigurations as KnowledgeJsonObject[])[0]?.fields as KnowledgeJsonObject[])
      .map(({ id }) => id).slice(0, 2)).toEqual(["field-textarea", "field-text"]);

    await user.click(screen.getByRole("button", {
      name: "Remove PMC components PMC mark"
    }));
    latest = onPayload.mock.calls.at(-1)?.[0] as KnowledgeJsonObject;
    const remainingIds = (
      (latest.modeConfigurations as KnowledgeJsonObject[])[0]?.fields as KnowledgeJsonObject[]
    ).map(({ id }) => id);
    expect(remainingIds).not.toContain("field-text");
    expect(remainingIds).toContain("field-textarea");
  });

  it("keeps definitions visible but disables mutation controls in read-only history", async () => {
    const user = userEvent.setup();
    render(<Harness initialPayload={definitionPayload} readOnly />);

    const pmc = screen.getByRole("region", { name: "PMC components" });
    expect(within(pmc).queryByRole("button", { name: /Add|Move|Remove/u }))
      .not.toBeInTheDocument();
    expect(within(pmc).getAllByRole("textbox", { name: "Component label" })[0])
      .toBeDisabled();
    expect(screen.queryByText("legacy answer")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "execution");
    await user.click(screen.getByRole("radio", { name: "In-house" }));
    expect(screen.getByDisplayValue("In-house crew")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add component" })).not.toBeInTheDocument();
  });

  it("focuses the first invalid Component label and announces user-facing validation", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.click(screen.getByRole("button", { name: "Attempt save" }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Component label" })).toHaveFocus();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Component label is required.");
    expect(screen.getByRole("textbox", { name: "Component label" }))
      .toHaveAttribute("aria-invalid", "true");
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
          fields: [{ id: "field-unscoped", type: "dropdown", label: "Recovered work", options: ["A", "B"], value: "Private saved answer" }]
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
    expect(recovery).not.toHaveTextContent("Private saved answer");

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
    expect(JSON.stringify(latest.modeConfigurations)).not.toContain("value");
  });

  it("keeps legacy reusable rows explicit and removable without exposing saved answers or IDs", async () => {
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
    expect(recovery).not.toHaveTextContent("Private old answer");
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
