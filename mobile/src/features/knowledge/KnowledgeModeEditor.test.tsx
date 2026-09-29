import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { KnowledgeJsonObject } from "../../../../shared/knowledge/knowledgeTypes";
import type { KnowledgeModeEditorProps } from "./knowledgeEditorContracts";
import { KnowledgeModeEditor } from "./KnowledgeModeEditor";

jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));

const onPayload = jest.fn();
const onPricing = jest.fn();
const onValidity = jest.fn();
const setupProps = { item: { mainLineName: "Synthetic panel" }, context: { scopeKey: "test:user", api: { previewKnowledge: jest.fn() } }, masters: { modes: [], uoms: [{ id: "uom", name: "Square foot", decimalScale: 2 }] }, overviewPayload: { uomId: "uom" }, catalogsReady: true } as unknown as Pick<KnowledgeModeEditorProps, "item" | "context" | "masters" | "overviewPayload" | "catalogsReady">;
function Harness({ initial = {}, pricing = {}, readOnly = false, protectedIds = [] }: { initial?: KnowledgeJsonObject; pricing?: KnowledgeJsonObject; readOnly?: boolean; protectedIds?: readonly string[] }) {
  const [payload, setPayload] = useState(initial);
  const [pricingPayload, setPricing] = useState(pricing);
  return <KnowledgeModeEditor {...setupProps} payload={payload} onChange={next => { onPayload(next); setPayload(next); }} pricingPayload={pricingPayload} onPricingChange={next => { onPricing(next); setPricing(next); }} readOnly={readOnly} referencedSpecificationIds={protectedIds} onValidityChange={onValidity} />;
}

async function showExecution() {
  const execution = screen.getByRole("checkbox", { name: "Execution" });
  if (!execution.props.accessibilityState?.checked) await fireEvent.press(execution);
}

describe("native Mode editing", () => {
  beforeEach(() => jest.clearAllMocks());
  it("keeps incomplete money edits, dirty state and hidden modes without losing the draft", async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText("PMC Base Rate (₹)"), "12.");
    expect(screen.getByLabelText("PMC Base Rate (₹)")).toHaveDisplayValue("12.");
    expect(onPayload.mock.lastCall?.[0].modeCalculations.pmc.baseRatePaise).toBe("12.");
    expect(onValidity).toHaveBeenLastCalledWith(false);
    await fireEvent.press(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.queryByLabelText("PMC Base Rate (₹)")).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "PMC" }));
    expect(screen.getByLabelText("PMC Base Rate (₹)")).toHaveDisplayValue("12.");
    await fireEvent.changeText(screen.getByLabelText("PMC Base Rate (₹)"), "12.34");
    expect(onPayload.mock.lastCall?.[0].modeCalculations.pmc.baseRatePaise).toBe(1234);
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });

  it("stores Sub-Vendor scope on its canonical PMC row and syncs the shared description", async () => {
    await render(<Harness initial={{ modeDescription: "Custom work, inclusions none and exclusions none.", retained: "keep" }} />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" })).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor Exclusion: Transport" })).toBeOnTheScreen();
    expect(onPayload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Add Sub-Vendor Inclusion" }));
    await fireEvent.changeText(screen.getByLabelText("Sub-Vendor Inclusion name"), "Installation");
    await fireEvent.press(screen.getByRole("button", { name: "Add Inclusion" }));
    expect(screen.getByText("Installation")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Installation" }));
    const payload = onPayload.mock.lastCall?.[0];
    expect(payload).toMatchObject({ retained: "keep", modeDescription: "Custom work, inclusions Installation and exclusions none." });
    expect(payload.modeConfigurations[0]).toMatchObject({ modeKind: "pmc", inclusions: expect.arrayContaining([expect.objectContaining({ name: "Installation", selected: true })]) });
    expect(payload.modeConfigurations[0].exclusions).toHaveLength(6);
    await fireEvent.press(screen.getByRole("checkbox", { name: "In-house" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "In-house Inclusion: Supplier" }));
    expect(onPayload.mock.lastCall?.[0].modeConfigurations).toEqual(expect.arrayContaining([expect.objectContaining({ modeKind: "execution", executionSource: "in_house", inclusions: expect.arrayContaining([expect.objectContaining({ name: "Supplier", selected: true })]) })]));
    expect(onPayload.mock.lastCall?.[0].modeDescription).toContain("In-house Inclusions: Supplier.");
  });

  it("shows Sub-Vendor starters without writing them, then materializes both lists on the first edit", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Execution" }));
    const names = ["Transport", "Shifting", "Unloading", "ESIC/ PF", "Mathadi", "Damage during"];
    for (const name of names) {
      expect(screen.getByRole("checkbox", { name: `Sub-Vendor Inclusion: ${name}` })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: `Sub-Vendor Exclusion: ${name}` })).not.toBeChecked();
    }
    expect(onPayload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" }));
    const configuration = onPayload.mock.lastCall?.[0].modeConfigurations[0];
    expect(configuration.inclusions.map((row: { name: string }) => row.name)).toEqual(names);
    expect(configuration.exclusions.map((row: { name: string }) => row.name)).toEqual(names);
    expect(configuration.inclusions[0]).toMatchObject({ selected: true });
    expect(configuration.exclusions[0]).toMatchObject({ selected: false });
    expect(configuration.inclusions[0].id).not.toBe(configuration.exclusions[0].id);
  });

  it("blocks the opposite Sub-Vendor selection in either direction and re-enables it after uncheck or delete", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Execution" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" }));
    expect(screen.getByRole("checkbox", { name: /Sub-Vendor Exclusion: Transport/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Sub-Vendor Exclusion: Transport/ }).props.accessibilityLabel).toContain("Selected in Inclusions.");
    const callCount = onPayload.mock.calls.length;
    await fireEvent.press(screen.getByRole("checkbox", { name: /Sub-Vendor Exclusion: Transport/ }));
    expect(onPayload).toHaveBeenCalledTimes(callCount);

    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" }));
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor Exclusion: Transport" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Exclusion: Transport" }));
    expect(screen.getByRole("checkbox", { name: /Sub-Vendor Inclusion: Transport/ })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Remove Sub-Vendor Exclusion 1" }));
    expect(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" })).toBeEnabled();
  });

  it("keeps saved empty lists empty", async () => {
    await render(<Harness initial={{ modeConfigurations: [{ id: "saved-pmc", modeKind: "pmc", fields: [], inclusions: [], exclusions: [] }] }} />);
    await showExecution();
    expect(screen.queryByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Sub-Vendor Exclusion: Transport" })).toBeNull();
    expect(onPayload).not.toHaveBeenCalled();
  });

  it("does not show unsaved starter rows on a read-only revision", async () => {
    await render(<Harness readOnly />);
    await showExecution();
    expect(screen.queryByRole("checkbox", { name: "Sub-Vendor Inclusion: Transport" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Sub-Vendor Exclusion: Transport" })).toBeNull();
    expect(onPayload).not.toHaveBeenCalled();
  });

  it("does not backfill a missing list on an existing saved configuration", async () => {
    await render(<Harness initial={{ modeConfigurations: [{ id: "saved-pmc", modeKind: "pmc", fields: [], inclusions: [{ id: "custom", name: "Custom work", selected: false }] }] }} />);
    await showExecution();
    expect(screen.queryByRole("checkbox", { name: "Sub-Vendor Exclusion: Transport" })).toBeNull();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Custom work" }));
    const configuration = onPayload.mock.lastCall?.[0].modeConfigurations[0];
    expect(configuration.inclusions).toEqual([{ id: "custom", name: "Custom work", selected: true }]);
    expect(configuration).not.toHaveProperty("exclusions");
  });

  it("allows a legacy both-selected row to be repaired by unchecking either side", async () => {
    await render(<Harness initial={{ modeConfigurations: [{ id: "saved-pmc", modeKind: "pmc", fields: [], inclusions: [{ id: "in-1", name: "ESIC/ PF", selected: true }], exclusions: [{ id: "out-1", name: "ESIC/  PF", selected: true }] }] }} />);
    await showExecution();
    const inclusion = screen.getByRole("checkbox", { name: /Sub-Vendor Inclusion: ESIC\/ PF/ });
    expect(inclusion).toBeEnabled();
    expect(inclusion.props.accessibilityLabel).toContain("Selected in both lists. Uncheck one before saving.");
    await fireEvent.press(inclusion);
    expect(onPayload.mock.lastCall?.[0].modeConfigurations[0].inclusions[0].selected).toBe(false);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Sub-Vendor Inclusion: ESIC\/ PF/ })).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: /Sub-Vendor Exclusion: ESIC/ })).toBeEnabled();
  });

  it("exposes disclosure state and preserves the draft when sections collapse", async () => {
    await render(<Harness initial={{ retained: "keep" }} />);
    await fireEvent.changeText(screen.getByLabelText("PMC Base Rate (₹)"), "12.");
    onPayload.mockClear();
    expect(screen.getByRole("button", { name: "Collapse PMC", expanded: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Collapse PMC" }));
    expect(screen.getByRole("button", { name: "Expand PMC", expanded: false })).toBeOnTheScreen();
    expect(screen.queryByLabelText("PMC Base Rate (₹)")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Expand PMC" }));
    expect(screen.getByLabelText("PMC Base Rate (₹)")).toHaveDisplayValue("12.");

    await fireEvent.press(screen.getByRole("checkbox", { name: "Execution" }));
    expect(screen.getByRole("button", { name: "Collapse Execution", expanded: true })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Collapse Sub-Vendor", expanded: true }));
    expect(screen.getByRole("button", { name: "Expand Sub-Vendor", expanded: false })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Sub-Vendor Base Rate (₹)")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Expand Sub-Vendor" }));
    expect(screen.getByLabelText("Sub-Vendor Base Rate (₹)")).toBeOnTheScreen();
    expect(onPayload).not.toHaveBeenCalled();
    expect(onPricing).not.toHaveBeenCalled();
    expect(onValidity).toHaveBeenLastCalledWith(false);
  });

  it("edits Specifications without dropping typed compatibility, and protects referenced removal", async () => {
    await render(<Harness pricing={{ specifications: [{ id: "spec-1", name: "Panel", type: "dropdown", options: ["Oak"], value: "Oak" }], legacyPrice: true }} protectedIds={["spec-1"]} />);
    expect(screen.getByRole("button", { name: "Remove Specification 1" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Edit Specification 1" }));
    await fireEvent.changeText(screen.getByLabelText("Item name"), "Updated panel");
    expect(onPricing.mock.lastCall?.[0]).toMatchObject({ legacyPrice: true, specifications: [{ id: "spec-1", name: "Updated panel", type: "dropdown", options: ["Oak"], value: "Oak" }] });
  });

  it("read-only configuration has no edit actions and inherited UOM stays locked", async () => {
    await render(<Harness readOnly />);
    expect(screen.getByLabelText("PMC Base Rate (₹)")).toHaveProp("editable", false);
    expect(screen.getByLabelText("PMC UOM")).toHaveProp("editable", false);
    expect(screen.queryByRole("button", { name: "Edit Description" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Specification" })).toBeNull();
    await waitFor(() => expect(onPayload).not.toHaveBeenCalled());
  });

  it("requires paragraph apply/cancel and restores scope-synchronized text when cancelled", async () => {
    await render(<Harness initial={{ modeDescription: "Custom work, inclusions none and exclusions none." }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Edit Description" }));
    expect(onValidity).toHaveBeenLastCalledWith(false);
    await fireEvent.changeText(screen.getByLabelText("Description"), "Changed wording");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel description" }));
    expect(onPayload.mock.lastCall?.[0].modeDescription).toBe("Custom work, inclusions none and exclusions none.");
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });
});
