import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EstimateItemPicker, type EstimateItemPickerProps } from "./EstimateItemPicker";

const catalogue = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), name: `Kitchen item ${index}`, context: "Cabinetry · Base units" }));
function Picker({ onAdd = vi.fn(), state = "ready" }: Partial<Pick<EstimateItemPickerProps, "onAdd" | "state">>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = catalogue.filter(item => item.name.includes(search));
  return <EstimateItemPicker roomName="Kitchen" open={open} onOpenChange={setOpen} search={search} onSearchChange={setSearch}
    items={filtered.slice(offset, offset + 20).map(item => ({ ...item, selected: selected.includes(item.id) }))}
    total={filtered.length} offset={offset} onOffsetChange={setOffset} state={state}
    baskets={[{ id: "cabinetry", name: "Cabinetry", subBaskets: [{ id: "base", name: "Base units" }] }]}
    basketId="all" subBasketId="all" onBasketChange={vi.fn()} onSubBasketChange={vi.fn()} onAdd={id => {
      if (onAdd(id) === false) return false;
      setSelected(current => [...current, id]); return true;
    }} />;
}

describe("inline estimate item picker", () => {
  it("keeps a large catalogue closed until requested, pages twenty rows and searches beyond page one", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    expect(screen.queryByRole("list", { name: "Available items" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add items" }));
    const list = screen.getByRole("list", { name: "Available items" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByRole("searchbox", { name: "Search available items" })).toHaveFocus();
    expect(within(screen.getByRole("combobox", { name: "Main Basket" })).getByRole("option", { name: "All Main Baskets", selected: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Add Kitchen item 20" })).toBeVisible();
    await user.type(screen.getByRole("searchbox"), "999");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add Kitchen item 999" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds only the chosen item, keeps keyboard focus usable and returns it on Escape", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(() => true);
    render(<Picker onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Add items" }));
    screen.getByRole("button", { name: "Add Kitchen item 0" }).focus();
    await user.keyboard("{Enter}");
    expect(onAdd).toHaveBeenCalledExactlyOnceWith("0");
    expect(screen.getByRole("button", { name: "Added Kitchen item 0" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Kitchen item 1" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Add items" })).toHaveFocus();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("does not announce rejected additions and disables mutation while catalogue is stale", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(() => false);
    const { rerender } = render(<Picker onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Add items" }));
    await user.click(screen.getByRole("button", { name: "Add Kitchen item 0" }));
    expect(screen.queryByText("Kitchen item 0 added to Kitchen.")).not.toBeInTheDocument();
    rerender(<Picker onAdd={onAdd} state="stale" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Available items changed");
    expect(screen.getByRole("button", { name: "Add Kitchen item 0" })).toBeDisabled();
  });
});
