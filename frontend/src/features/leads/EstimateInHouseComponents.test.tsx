import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EstimateInHouseComponents } from "./EstimateInHouseComponents";
import { configuredInHouseSelectionIssue, configuredModeBaseRate, type ConfiguredLineDraft } from "./configuredEstimate";
const component = { id: "component", basketId: "basket", basketName: "Ceilings", subBasketId: "sub", subBasketName: "Framework", baseRatePaise: null };
const draft: ConfiguredLineDraft = { key: "line", roomId: "room", catalogueId: "main", mainBasketId: "basket", mainBasketName: "Ceilings", itemType: "main_line", subBasketId: "sub", subBasketName: "Framework", mainLineId: "main", revisionId: "revision", uomId: "sqft", uomDecimalScale: 2, quantity: 1, rateInput: "10", included: true, sourceMissing: false, pricingMode: "in_house", rateSource: "manual", mainLineName: "Ceiling", roomName: "Living", uomName: "sq ft", selectedInHouseComponentIds: [], inHouseComponents: [component] };
describe("estimate component availability", () => {
  it("keeps configured base prices out of the component picker", () => {
    render(<EstimateInHouseComponents line={{ ...draft, inHouseComponents: [{ ...component, baseRatePaise: 12345 }] }} editable onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Ceilings / Framework" })).toBeEnabled();
    expect(screen.queryByText(/Base reference|₹123/)).not.toBeInTheDocument();
  });

  it("retains a live status and links the warning when the last component is removed", () => {
    const onChange = vi.fn();
    const { rerender } = render(<EstimateInHouseComponents line={{ ...draft, selectedInHouseComponentIds: ["component"] }} editable onChange={onChange} />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ceilings \/ Framework/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([]);
    rerender(<EstimateInHouseComponents line={draft} editable onChange={onChange} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Choose at least one In-house component.");
    expect(screen.getByRole("group", { name: "In-house components for Ceiling in Living" }))
      .toHaveAccessibleDescription("Choose at least one In-house component.");
    rerender(<EstimateInHouseComponents line={{ ...draft, selectedInHouseComponentIds: ["component"] }} editable onChange={onChange} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toBeEmptyDOMElement();
  });

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
