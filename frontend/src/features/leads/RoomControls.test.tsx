import axe from "axe-core";
import { useState } from "react";
import { Armchair, BedDouble } from "lucide-react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PropertyTypeDropdown } from "./PropertyTypeDropdown";
import { getEstimateRoomDefinitions, getRoomIcon, mergeSelectedRoomDefinitions } from "./estimateRoomOptions";
import { RoomsMultiSelectDropdown, type RoomDimensionValue, type RoomOption } from "./RoomsMultiSelectDropdown";

const roomOptions: RoomOption[] = [
  { id: "master", label: "Master Bedroom", group: "Bedrooms", icon: BedDouble },
  { id: "living", label: "Living & Dining", group: "Common Areas", icon: Armchair }
];
const initialDimensions: RoomDimensionValue[] = [
  { id: "saved-living", selectionKey: "living", label: "Living & Dining", length: null, width: 7 },
  { id: "saved-master", selectionKey: "master", label: "Master Bedroom", length: 12, width: 10 }
];

function RoomSelectorHarness() {
  const [selected, setSelected] = useState<string[]>([]);
  return <RoomsMultiSelectDropdown options={roomOptions} selected={selected} onChange={setSelected} />;
}

function DimensionsHarness({ initial = initialDimensions, onEdit = vi.fn(), onRemove = vi.fn() }: {
  initial?: RoomDimensionValue[];
  onEdit?: (id: string, change: { length?: number | null; width?: number | null }) => void;
  onRemove?: (id: string) => void;
}) {
  const [rooms, setRooms] = useState(initial);
  return <RoomsMultiSelectDropdown
    options={roomOptions}
    selected={rooms.map((room) => room.selectionKey)}
    dimensions={rooms}
    onChange={(keys) => setRooms((current) => [
      ...current.filter((room) => keys.includes(room.selectionKey)),
      ...roomOptions.filter((option) => keys.includes(option.id) && !current.some((room) => room.selectionKey === option.id))
        .map((option) => ({ id: `saved-${option.id}`, selectionKey: option.id, label: option.label, length: null, width: null }))
    ])}
    onDimensionChange={(id, change) => {
      onEdit(id, change);
      setRooms((current) => current.map((room) => room.id === id ? { ...room, ...change } : room));
    }}
    onRemoveRoom={(id) => {
      onRemove(id);
      setRooms((current) => current.filter((room) => room.id !== id));
    }}
  />;
}

describe("room controls", () => {
  it("shows grouped square feet, updates only the edited room, and retains decimal precision", async () => {
    const user = userEvent.setup();
    render(<DimensionsHarness initial={[
      { ...initialDimensions[0], length: 200, width: 200 },
      initialDimensions[1]
    ]} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    const area = screen.getByRole("status", { name: "Living & Dining area (sq ft)" });
    const otherArea = screen.getByRole("status", { name: "Master Bedroom area (sq ft)" });
    expect(area).toHaveTextContent("40,000 sq ft");
    expect(otherArea).toHaveTextContent("120 sq ft");
    const length = screen.getByRole("spinbutton", { name: "Living & Dining length" });
    const width = screen.getByRole("spinbutton", { name: "Living & Dining width" });
    await user.clear(length);
    expect(area).toHaveTextContent("Not set");
    await user.type(length, "12.345");
    await user.clear(width);
    await user.type(width, "3");
    expect(area).toHaveTextContent("37.04 sq ft");
    expect(otherArea).toHaveTextContent("120 sq ft");
    expect(screen.getByRole("checkbox", { name: "Living & Dining" })).toBeChecked();
  });

  it("shows Not set for missing, non-positive, or overflowing dimensions", async () => {
    const user = userEvent.setup();
    const props = { options: roomOptions, selected: ["living"], onChange: vi.fn() };
    const { rerender } = render(<RoomsMultiSelectDropdown {...props} dimensions={[initialDimensions[0]]} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    for (const [length, width] of [[null, 7], [7, null], [0, 7], [-3, 7], [7, -3], [Number.MAX_VALUE, 2]]) {
      rerender(<RoomsMultiSelectDropdown {...props} dimensions={[{ ...initialDimensions[0], length, width }]} />);
      expect(screen.getByRole("status", { name: "Living & Dining area (sq ft)" })).toHaveTextContent("Not set");
    }
  });

  it("edits only the saved room, retains blank values and measurements through search/reopen, and never submits", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const { container } = render(<main><form onSubmit={onSubmit}><DimensionsHarness onEdit={onEdit} onRemove={onRemove} /><button type="submit">Save</button></form></main>);
    const trigger = screen.getByRole("button", { name: "Select rooms" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Rooms" })).toHaveAttribute("aria-modal", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    const livingRow = screen.getByRole("group", { name: "Living & Dining room" });
    const length = within(livingRow).getByRole("spinbutton", { name: "Living & Dining length" });
    expect(length).toHaveValue(null);
    expect(within(livingRow).getByText("Length (ft)")).toBeVisible();
    expect(within(livingRow).getByText("Width (ft)")).toBeVisible();
    await user.type(length, "15.5");
    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenLastCalledWith("saved-living", { length: 15.5 });
    expect(length).toHaveFocus();
    expect(within(livingRow).getByRole("checkbox", { name: "Living & Dining" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom length" })).toHaveValue(12);
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom width" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "Living & Dining width" })).toHaveValue(7);
    expect(onRemove).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.type(search, "Master");
    expect(screen.queryByRole("spinbutton", { name: "Living & Dining length" })).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.clear(search);
    expect(screen.getByRole("spinbutton", { name: "Living & Dining length" })).toHaveValue(15.5);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("spinbutton", { name: "Living & Dining length" })).toHaveValue(15.5);
    await user.clear(screen.getByRole("spinbutton", { name: "Master Bedroom width" }));
    expect(onEdit).toHaveBeenLastCalledWith("saved-master", { width: null });
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom width" })).toHaveValue(null);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Rooms" })).not.toBeInTheDocument();
  });

  it("reveals inputs only for selected rows and removes the intended saved record", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<DimensionsHarness initial={[initialDimensions[0]]} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    expect(screen.queryByRole("spinbutton", { name: "Master Bedroom length" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Master Bedroom" }));
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom length" })).toHaveValue(null);
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom width" })).toHaveValue(null);
    await user.click(screen.getByRole("checkbox", { name: "Living & Dining" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("saved-living");
    expect(screen.queryByRole("spinbutton", { name: "Living & Dining length" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Master Bedroom" })).toBeChecked();
    expect(screen.getByText("1 room selected")).toBeVisible();
  });

  it("keeps duplicate saved instances independently editable and removable by stable ID", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(<DimensionsHarness initial={[
      initialDimensions[1],
      { ...initialDimensions[1], id: "saved-master-two", length: 16, width: 9 }
    ]} onEdit={onEdit} onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    const first = screen.getByRole("group", { name: "Master Bedroom room (1 of 2)" });
    const second = screen.getByRole("group", { name: "Master Bedroom room (2 of 2)" });
    expect(first).toHaveAttribute("data-room-id", "saved-master");
    expect(second).toHaveAttribute("data-room-id", "saved-master-two");
    const width = within(second).getByRole("spinbutton", { name: "Master Bedroom width" });
    await user.clear(width);
    await user.type(width, "8");
    expect(onEdit).toHaveBeenLastCalledWith("saved-master-two", { width: 8 });
    expect(within(first).getByRole("spinbutton", { name: "Master Bedroom width" })).toHaveValue(10);
    await user.click(within(first).getByRole("checkbox", { name: "Master Bedroom" }));
    expect(onRemove).toHaveBeenCalledExactlyOnceWith("saved-master");
    expect(screen.getByRole("checkbox", { name: "Master Bedroom" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom length" })).toHaveValue(16);
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom width" })).toHaveValue(8);
  });

  it("keeps keyboard choice aligned with grouped option order and reports room counts accurately", async () => {
    const user = userEvent.setup();
    render(<RoomSelectorHarness />);
    const trigger = screen.getByRole("button", { name: "Select rooms" });
    await user.click(trigger);
    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.click(search);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("checkbox", { name: "Living & Dining" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText("1 room selected")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Master Bedroom" })).toBeChecked();
    await user.keyboard("{ArrowUp} ");
    expect(screen.getByRole("checkbox", { name: "Living & Dining" })).toBeChecked();
    expect(screen.getByText("2 rooms selected")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(trigger).toHaveFocus();
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
    expect(within(screen.getByRole("group", { name: "Previously selected" })).getByRole("checkbox", { name: "Guest Bedroom" })).toBeChecked();
    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.type(search, "Bedroom 1");
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText(`4 of ${options.length} selected`)).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Guest Bedroom from selected rooms" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText(`1 of ${options.length} selected`)).toBeVisible();
    await user.clear(search);
    await user.type(search, "No matching room");
    expect(screen.getByRole("status")).toHaveTextContent("No rooms found");
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByText(`1 of ${options.length} selected`)).toBeVisible();
    expect(search).toHaveFocus();
    expect(search).not.toHaveAttribute("aria-activedescendant");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Select rooms" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("list", { name: "Selected rooms" })).not.toBeInTheDocument();
  });

  it("returns to search when a focused room disappears without activating a different room", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<RoomsMultiSelectDropdown options={roomOptions} selected={[]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    const search = screen.getByRole("textbox", { name: "Search rooms" });
    await user.click(search);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("checkbox", { name: "Master Bedroom" })).toHaveFocus();
    rerender(<RoomsMultiSelectDropdown options={[roomOptions[1]]} selected={[]} onChange={onChange} />);
    expect(search).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(["living"]);
  });

  it("keeps existing measurements inspectable while disabling every mutation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDimensionChange = vi.fn();
    const onRemoveRoom = vi.fn();
    const props = { options: roomOptions, selected: ["master", "living"], dimensions: initialDimensions, onChange, onDimensionChange, onRemoveRoom };
    const { container, rerender } = render(<main><RoomsMultiSelectDropdown {...props} /></main>);
    const trigger = screen.getByRole("button", { name: "Select rooms" });
    await user.click(trigger);
    rerender(<main><RoomsMultiSelectDropdown {...props} disabled /></main>);
    expect(trigger).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom length" })).toHaveValue(12);
    const length = screen.getByRole("spinbutton", { name: "Master Bedroom length" });
    expect(length).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom width" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Master Bedroom area (sq ft)" })).toHaveTextContent("120 sq ft");
    expect(screen.getByRole("status", { name: "Living & Dining area (sq ft)" })).toHaveTextContent("Not set");
    const checkbox = screen.getByRole("checkbox", { name: "Master Bedroom" });
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deselect all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    const remove = screen.getByRole("button", { name: "Remove Master Bedroom from selected rooms" });
    expect(remove).toBeDisabled();
    await user.click(remove);
    await user.click(checkbox);
    await user.type(length, "6");
    fireEvent.change(length, { target: { value: "99" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(onDimensionChange).not.toHaveBeenCalled();
    expect(onRemoveRoom).not.toHaveBeenCalled();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("spinbutton", { name: "Master Bedroom length" })).toHaveValue(12);
    await user.type(screen.getByRole("textbox", { name: "Search rooms" }), "Living");
    expect(screen.getByRole("spinbutton", { name: "Living & Dining width" })).toHaveValue(7);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("closes and disables an unavailable picker without saved dimensions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<RoomsMultiSelectDropdown options={roomOptions} selected={["master"]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    rerender(<RoomsMultiSelectDropdown options={roomOptions} selected={["master"]} onChange={onChange} disabled />);
    expect(screen.queryByRole("dialog", { name: "Rooms" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select rooms" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove Master Bedroom from selected rooms" }));
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
