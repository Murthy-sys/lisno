import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EstimateInHouseComponents } from "./EstimateInHouseComponents";
import { configuredInHouseSelectionIssue, configuredModeBaseRate, type ConfiguredLineDraft } from "./configuredEstimate";
const component = { id: "component", basketId: "basket", basketName: "Ceilings", subBasketId: "sub", subBasketName: "Framework", baseRatePaise: null };
const draft: ConfiguredLineDraft = { key: "line", roomId: "room", catalogueId: "main", mainBasketId: "basket", mainBasketName: "Ceilings", itemType: "main_line", subBasketId: "sub", subBasketName: "Framework", mainLineId: "main", revisionId: "revision", uomId: "sqft", uomDecimalScale: 2, quantity: 1, rateInput: "10", included: true, sourceMissing: false, pricingMode: "in_house", rateSource: "manual", mainLineName: "Ceiling", roomName: "Living", uomName: "sq ft", selectedInHouseComponentIds: [], inHouseComponents: [component] };
describe("estimate component availability", () => {
  it("allows selecting an available component with blank costs for manual pricing", () => {
    const onChange = vi.fn(); render(<EstimateInHouseComponents line={draft} editable onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ceilings \/ Framework/ }));
    expect(onChange).toHaveBeenCalledWith(["component"]);
    expect(configuredInHouseSelectionIssue({ ...draft, selectedInHouseComponentIds: ["component"] })).toBeNull();
  });
  it("labels an unavailable component and prevents adding it even if an old cost remains", () => {
    const line = { ...draft, inHouseComponents: [{ ...component, baseRatePaise: 1000, unavailableReason: "Archived parent" }] };
    render(<EstimateInHouseComponents line={line} editable onChange={vi.fn()} />);
    expect(screen.getByText("Unavailable; review the configuration")).toBeVisible();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(configuredInHouseSelectionIssue({ ...line, selectedInHouseComponentIds: ["component"] })).toMatch(/unavailable/);
    expect(configuredModeBaseRate({ ...line, selectedInHouseComponentIds: ["component"] }, "in_house")).toBeNull();
  });
  it("keeps an unavailable existing selection removable", () => {
    const onChange = vi.fn(); render(<EstimateInHouseComponents line={{ ...draft, selectedInHouseComponentIds: ["component"], inHouseComponents: [{ ...component, unavailableReason: "Removed group" }] }} editable onChange={onChange} />);
    expect(screen.getByRole("checkbox")).toBeChecked(); expect(screen.getByRole("checkbox")).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox")); expect(onChange).toHaveBeenCalledWith([]);
  });
});
