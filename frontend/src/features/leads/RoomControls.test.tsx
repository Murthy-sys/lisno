import axe from "axe-core";
import { useState } from "react";
import { Armchair, BedDouble } from "lucide-react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PropertyTypeDropdown } from "./PropertyTypeDropdown";
import { getEstimateRoomDefinitions, getRoomIcon, mergeSelectedRoomDefinitions } from "./estimateRoomOptions";
import { RoomDimensionsAccordion, type RoomDimensionItem } from "./RoomDimensionsAccordion";
import { RoomsMultiSelectDropdown, type RoomOption } from "./RoomsMultiSelectDropdown";

const roomOptions: RoomOption[] = [
  { id: "master", label: "Master Bedroom", group: "Bedrooms", icon: BedDouble },
  { id: "living", label: "Living & Dining", group: "Common Areas", icon: Armchair }
];

function RoomSelectorHarness() {
  const [selected, setSelected] = useState<string[]>([]);
  return <RoomsMultiSelectDropdown options={roomOptions} selected={selected} onChange={setSelected} />;
}

function DimensionsHarness() {
  const [rooms, setRooms] = useState<RoomDimensionItem[]>([
    { id: "living", label: "Living & Dining", icon: Armchair, length: null, width: null },
    { id: "master", label: "Master Bedroom", icon: BedDouble, length: 12, width: 10 }
  ]);

  return <RoomDimensionsAccordion
    rooms={rooms}
    onDimensionChange={(id, change) => setRooms((current) => current.map((room) => room.id === id ? { ...room, ...change } : room))}
    onRemove={(id) => setRooms((current) => current.filter((room) => room.id !== id))}
  />;
}

describe("room controls", () => {
  it("keeps one disclosure per room, updates dimensions, and removes the intended room", async () => {
    const user = userEvent.setup();
    render(<DimensionsHarness />);

    const living = screen.getByRole("region", { name: /Living & Dining dimensions/ });
    const master = screen.getByRole("region", { name: /Master Bedroom dimensions/ });
    expect(within(living).getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(within(master).getByText("120 sqft")).toBeVisible();

    const disclosure = within(living).getByRole("button", { expanded: true });
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(within(living).queryByRole("spinbutton", { name: "Living & Dining length" })).not.toBeInTheDocument();

    await user.click(disclosure);
    await user.type(within(living).getByRole("spinbutton", { name: "Living & Dining length" }), "12");
    await user.type(within(living).getByRole("spinbutton", { name: "Living & Dining width" }), "10");
    expect(within(living).getByText("120 sqft")).toBeVisible();
    expect(within(living).getByText("Length (ft)")).toBeVisible();

    await user.click(within(living).getByRole("button", { name: "Remove Living & Dining room" }));
    expect(screen.queryByRole("region", { name: /Living & Dining dimensions/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Master Bedroom dimensions/ })).toBeVisible();
  });

  it("keeps keyboard choice aligned with grouped option order and reports room counts accurately", async () => {
    const user = userEvent.setup();
    render(<RoomSelectorHarness />);

    const trigger = screen.getByRole("button", { name: "Select rooms" });
    await user.click(trigger);
    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.click(search);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("1 room selected")).toBeVisible();
    expect(screen.getByRole("option", { name: "Master Bedroom" })).toHaveAttribute("aria-selected", "true");

    await user.type(search, "Living");
    await user.click(screen.getByRole("option", { name: "Living & Dining" }));
    expect(screen.getByText("2 rooms selected")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Remove Master Bedroom from selected rooms" }));
    expect(screen.getByText("1 room selected")).toBeVisible();
    expect(within(screen.getByRole("list", { name: "Selected rooms" })).queryByText("Master Bedroom")).not.toBeInTheDocument();
  });
});


describe("dynamic and read-only room controls", () => {
  it("searches and selects the displayed profile while preserving hidden retained selections", async () => {
    const user = userEvent.setup();
    const definitions = mergeSelectedRoomDefinitions(getEstimateRoomDefinitions("1BHK", null), [{ typeId: "bedroom3", label: "Guest Bedroom" }]);
    const options = definitions.map((room) => ({ id: room.typeId, label: room.label, group: room.group, icon: getRoomIcon(room.typeId) }));
    function Harness() {
      const [selected, setSelected] = useState(["bedroom3"]);
      return <RoomsMultiSelectDropdown options={options} selected={selected} onChange={setSelected} />;
    }
    const { container } = render(<main><Harness /></main>);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    expect(within(screen.getByRole("group", { name: "Previously selected" })).getByRole("option", { name: "Guest Bedroom" })).toHaveAttribute("aria-selected", "true");
    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.type(search, "Bedroom 1");
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("4 of 11 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Guest Bedroom from selected rooms" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("1 of 11 selected")).toBeVisible();
    await user.clear(search);
    await user.type(search, "No matching room");
    expect(screen.getByText("No rooms found")).toBeVisible();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("1 of 11 selected")).toBeVisible();
    expect(search).not.toHaveAttribute("aria-activedescendant");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Select rooms" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("list", { name: "Selected rooms" })).not.toBeInTheDocument();
  });

  it("does not activate a different option when the highlighted room disappears", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<RoomsMultiSelectDropdown options={roomOptions} selected={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.click(search);
    await user.keyboard("{ArrowDown}");
    const highlighted = document.getElementById(search.getAttribute("aria-activedescendant")!);
    expect(highlighted).toHaveTextContent("Master Bedroom");
    rerender(<RoomsMultiSelectDropdown options={[roomOptions[1]]} selected={[]} onChange={onChange} />);
    expect(search).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["living"]);
  });

  it("disables all room mutations while retaining dimensions disclosures", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<RoomsMultiSelectDropdown options={roomOptions} selected={["master"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    rerender(<RoomsMultiSelectDropdown options={roomOptions} selected={["master"]} onChange={onChange} disabled />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select rooms" })).toBeDisabled();
    const remove = screen.getByRole("button", { name: "Remove Master Bedroom from selected rooms" });
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<RoomDimensionsAccordion rooms={[{ id: "master", label: "Master Bedroom", icon: BedDouble, length: 12, width: 10 }]} onDimensionChange={onChange} onRemove={onChange} disabled />);
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom length" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom width" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Master Bedroom room" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Master Bedroom dimensions/ }));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("names property selection, restores focus on Escape and closes when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container, rerender } = render(<main><PropertyTypeDropdown options={["Villa", "Studio"]} value="Villa" onChange={onChange} /></main>);
    const trigger = screen.getByRole("button", { name: "Property type: Villa" });
    await user.click(trigger);
    const option = screen.getByRole("option", { name: "Studio" });
    option.focus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    rerender(<main><PropertyTypeDropdown options={["Villa", "Studio"]} value="Villa" onChange={onChange} disabled /></main>);
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
