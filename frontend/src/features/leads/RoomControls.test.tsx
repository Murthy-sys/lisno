import { useState } from "react";
import { Armchair, BedDouble } from "lucide-react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
