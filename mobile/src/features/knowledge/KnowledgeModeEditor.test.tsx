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
    await fireEvent.press(screen.getByRole("button", { name: "Add Sub-Vendor Inclusion" }));
    await fireEvent.changeText(screen.getByLabelText("Sub-Vendor Inclusion name"), "Installation");
    await fireEvent.press(screen.getByRole("button", { name: "Add Inclusion" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Sub-Vendor Inclusion: Installation" }));
    const payload = onPayload.mock.lastCall?.[0];
    expect(payload).toMatchObject({ retained: "keep", modeDescription: "Custom work, inclusions Installation and exclusions none.", modeConfigurations: [{ modeKind: "pmc", inclusions: [{ name: "Installation", selected: true }] }] });
    await fireEvent.press(screen.getByRole("checkbox", { name: "In-house" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "In-house Inclusion: Supplier" }));
    expect(onPayload.mock.lastCall?.[0].modeConfigurations).toEqual(expect.arrayContaining([expect.objectContaining({ modeKind: "execution", executionSource: "in_house", inclusions: expect.arrayContaining([expect.objectContaining({ name: "Supplier", selected: true })]) })]));
    expect(onPayload.mock.lastCall?.[0].modeDescription).toContain("In-house Inclusions: Supplier.");
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
    expect(screen.queryByRole("button", { name: "Edit Mode paragraph" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Specification" })).toBeNull();
    await waitFor(() => expect(onPayload).not.toHaveBeenCalled());
  });

  it("requires paragraph apply/cancel and restores scope-synchronized text when cancelled", async () => {
    await render(<Harness initial={{ modeDescription: "Custom work, inclusions none and exclusions none." }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Edit Mode paragraph" }));
    expect(onValidity).toHaveBeenLastCalledWith(false);
    await fireEvent.changeText(screen.getByLabelText("Mode paragraph"), "Changed wording");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel paragraph" }));
    expect(onPayload.mock.lastCall?.[0].modeDescription).toBe("Custom work, inclusions none and exclusions none.");
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });
});
