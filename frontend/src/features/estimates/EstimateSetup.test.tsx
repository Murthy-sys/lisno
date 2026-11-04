import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstimateSetupFields, type EstimateSetupFieldsProps } from "./EstimateSetupFields";
import { ConfigureSelectionFooter, EstimateSetupBaskets } from "./EstimateSetupBaskets";
import { MainBasketSelectionCard, type MainBasketSelectionSummary } from "../leads/MainBasketSelectionCard";
import { getRoomIcon } from "../leads/estimateRoomOptions";

const kitchen = { id: "stable-kitchen", label: "Kitchen", icon: getRoomIcon("kitchen"), length: 12, width: 8 };
function fields(overrides: Partial<EstimateSetupFieldsProps> = {}): EstimateSetupFieldsProps {
  return {
    propertyType: "1BHK", onPropertyTypeChange: vi.fn(), bedroomCountInput: "", onBedroomCountChange: vi.fn(),
    variableBedroomCount: false, bedroomCountRequired: false, editable: true, disabled: false,
    roomOptions: [{ id: "kitchen", label: "Kitchen", group: "Common Areas", icon: getRoomIcon("kitchen") }],
    selectedRoomTypeIds: ["kitchen"], onRoomsChange: vi.fn(), retainedRooms: false,
    rooms: [kitchen], onDimensionChange: vi.fn(), onRemoveRoom: vi.fn(), ...overrides
  };
}

describe("shared estimate setup", () => {
  it("uses the Sales property, room and stable-room dimension controls", async () => {
    const user = userEvent.setup();
    const props = fields();
    render(<EstimateSetupFields {...props} />);
    expect(screen.getByRole("heading", { name: "Project details" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Property type: 1BHK" }));
    await user.click(screen.getByRole("option", { name: "2BHK" }));
    expect(props.onPropertyTypeChange).toHaveBeenCalledWith("2BHK");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Kitchen length" }), { target: { value: "15" } });
    expect(props.onDimensionChange).toHaveBeenCalledWith("stable-kitchen", { length: 15 });
    await user.click(screen.getByRole("button", { name: "Remove Kitchen room" }));
    expect(props.onRemoveRoom).toHaveBeenCalledWith("stable-kitchen");
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Kitchen" }));
    expect(props.onRoomsChange).toHaveBeenCalledWith([]);
  });

  it("shows bedroom validation and retained-room guidance without defaulting missing saved values", () => {
    render(<EstimateSetupFields {...fields({ propertyType: "", variableBedroomCount: true, bedroomCountRequired: true, retainedRooms: true })} />);
    expect(screen.getByRole("button", { name: "Property type: Select property type" })).toBeVisible();
    const input = screen.getByRole("spinbutton", { name: "Number of bedrooms" });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/Enter the number of bedrooms to continue/);
    expect(screen.getByText(/Previously selected rooms are kept with their dimensions and items/)).toBeVisible();
  });

  it("keeps read-only fields disabled while dimensions remain inspectable", async () => {
    const user = userEvent.setup();
    render(<EstimateSetupFields {...fields({ disabled: true, editable: false })} />);
    expect(screen.getByRole("button", { name: "Property type: 1BHK" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select rooms" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Kitchen length" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Kitchen room" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Kitchen dimensions/ }));
    expect(screen.queryByRole("spinbutton", { name: "Kitchen length" })).not.toBeInTheDocument();
  });

  it("supports keyboard property selection and exposes separately scoped field labels", async () => {
    const user = userEvent.setup();
    const first = fields({ propertyType: "1BHK", variableBedroomCount: true });
    const second = fields({ propertyType: "Villa", variableBedroomCount: true });
    render(<><EstimateSetupFields {...first} /><EstimateSetupFields {...second} /></>);
    const inputs = screen.getAllByRole("spinbutton", { name: "Number of bedrooms" });
    expect(inputs[0].id).not.toBe(inputs[1].id);
    screen.getByRole("button", { name: "Property type: 1BHK" }).focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(first.onPropertyTypeChange).toHaveBeenCalledWith("2BHK");
    expect(screen.getByRole("button", { name: "Property type: 1BHK" })).toHaveFocus();
  });

  it("renders safe basket summaries without needing staff catalogue objects", async () => {
    const user = userEvent.setup();
    const summary: MainBasketSelectionSummary = { id: "basket", name: "Woodwork", subBaskets: [{ id: "sub", name: "Wardrobes", mainLineCount: 2, temporaryItemCount: 1 }], directTemporaryItemCount: 1 };
    const toggle = vi.fn();
    render(<MainBasketSelectionCard summary={summary} selected={false} disabled={false} onToggle={toggle} />);
    await user.click(screen.getByRole("button", { name: "Add Woodwork" }));
    expect(toggle).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Show Woodwork details" }));
    expect(screen.getByText("2 Main Lines · 1 Temporary Item")).toBeVisible();
    expect(screen.getByText("Directly under Main Basket")).toBeVisible();
  });

  it("shares basket search, loading status and footer actions without hiding errors", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const clear = vi.fn();
    const continueSelection = vi.fn();
    function Harness() {
      const [search, setSearch] = useState("");
      return <section className="estimate-workspace">
        <EstimateSetupBaskets search={search} onSearchChange={setSearch} onClearSearch={() => setSearch("")} onRefresh={refresh} refreshing={false} status={<p role="alert">Refresh failed. Retry before selecting items.</p>}>
          <p>Visible basket choices</p>
        </EstimateSetupBaskets>
        <ConfigureSelectionFooter count={2} clearDisabled={false} continueDisabled={true} onClear={clear} onContinue={continueSelection} />
      </section>;
    }
    render(<Harness />);
    await user.type(screen.getByRole("searchbox", { name: "Search baskets" }), "wood");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("searchbox", { name: "Search baskets" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Refresh available items" }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Refresh failed");
    const footer = screen.getByRole("region", { name: "Basket selection" });
    expect(within(footer).getByRole("status")).toHaveTextContent("2 selected");
    await user.click(within(footer).getByRole("button", { name: "Clear all" }));
    expect(clear).toHaveBeenCalledOnce();
    expect(within(footer).getByRole("button", { name: "Continue to item selection" })).toBeDisabled();
    expect(continueSelection).not.toHaveBeenCalled();
  });
});
