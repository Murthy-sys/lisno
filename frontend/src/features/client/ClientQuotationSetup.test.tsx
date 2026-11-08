import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ClientQuotationSetup, type ClientQuotationSetupProps } from "./ClientQuotationSetup";
import type { QuotationConfigureOperation, QuotationDetail, QuotationSetupCatalogue } from "./quotationApi";

function fixture() {
  const detail: QuotationDetail = {
    projectId: "project-one", estimateId: "estimate-one", estimateVersion: 8, workflowVersion: 3, pricedRevision: 2,
    phase: "pre", status: "draft", reviewState: "awaiting_staff_review", editingAllowed: true, editingBlockReason: null,
    totalPaise: 987600, isIncomplete: false, rooms: [{ id: "kitchen-saved", name: "Kitchen" }, { id: "bedroom-saved", name: "Guest bedroom" }],
    setup: { propertyType: "2BHK", bedroomCount: null, sourceToken: "setup-source", canConfigure: true,
      rooms: [
        { id: "kitchen-saved", typeId: "kitchen", label: "Kitchen", length: 12, width: 8, sqft: 96, canRemove: true, removalBlockedReason: null },
        { id: "bedroom-saved", typeId: "bedroom2", label: "Guest bedroom", length: 14, width: 10, sqft: 140, canRemove: true, removalBlockedReason: null }
      ], selectedMainBasketIds: ["woodwork"] },
    lines: [
      { id: "line-kitchen", mainLineId: "shelf", mainLineName: "Shelf", roomId: "kitchen-saved", roomName: "Kitchen", mainBasketId: "woodwork", mainBasketName: "Woodwork", included: true,
        source: null, quantity: 2, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 10000, amountPaise: 20000, choices: [] },
      { id: "line-bedroom", mainLineId: "shelf", mainLineName: "Shelf", roomId: "bedroom-saved", roomName: "Guest bedroom", mainBasketId: "woodwork", mainBasketName: "Woodwork", included: true,
        source: null, quantity: 3, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 10000, amountPaise: 30000, choices: [] }
    ]
  };
  const catalogue: QuotationSetupCatalogue = { projectId: detail.projectId, estimateId: detail.estimateId!, estimateVersion: 8, setup: structuredClone(detail.setup!), baskets: [
    { id: "woodwork", name: "Woodwork", subBaskets: [{ id: "storage", name: "Storage units", mainLineCount: 2, temporaryItemCount: 0 }], directTemporaryItemCount: 0, canSelect: true, canRemove: true, removalBlockedReason: null },
    { id: "painting", name: "Painting", subBaskets: [], directTemporaryItemCount: 1, canSelect: true, canRemove: true, removalBlockedReason: null }
  ] };
  return { detail, catalogue };
}

function mount(overrides: Partial<ClientQuotationSetupProps> = {}) {
  const changes: QuotationConfigureOperation[] = [];
  const props: ClientQuotationSetupProps = { ...fixture(), value: null, disabled: false, busy: false, onChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), onRefresh: vi.fn(), ...overrides };
  function Harness({ current }: { current: ClientQuotationSetupProps }) {
    const [value, setValue] = useState<QuotationConfigureOperation | null>(current.value);
    return <section className="estimate-workspace estimate-workspace--configure-view"><ClientQuotationSetup {...current} value={value} onChange={(next) => { changes.push(next); setValue(next); current.onChange(next); }} /></section>;
  }
  const rendered = render(<Harness current={props} />);
  return { ...rendered, props, changes, latest: () => changes.at(-1)!, refresh: (next: Partial<ClientQuotationSetupProps>) => rendered.rerender(<Harness current={{ ...props, ...next }} />) };
}

describe("Client Sales-style quotation setup", () => {
  it("restores actual property, room dimensions and basket selection and only saves on explicit action", async () => {
    const user = userEvent.setup();
    const { props, changes, latest } = mount();
    expect(screen.getByRole("button", { name: "Property type: 2BHK" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Kitchen length" })).toHaveValue(12);
    expect(screen.getByRole("spinbutton", { name: "Guest bedroom width" })).toHaveValue(10);
    expect(screen.getByRole("button", { name: "Added Woodwork" })).toHaveAttribute("aria-pressed", "true");
    expect(changes).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Add Painting" }));
    expect(latest().selectedMainBasketIds).toEqual(["woodwork", "painting"]);
    expect(latest().rooms.map((room) => room.id)).toEqual(["kitchen-saved", "bedroom-saved"]);
    expect(props.onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^(Continue to items|Save and continue to items)$/ }));
    expect(props.onSave).toHaveBeenCalledWith(true);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("retains existing room identity, labels and dimensions when property choices change", async () => {
    const user = userEvent.setup();
    const { latest } = mount();
    await user.click(screen.getByRole("button", { name: "Property type: 2BHK" }));
    await user.click(screen.getByRole("option", { name: "1BHK" }));
    expect(latest()).toMatchObject({ propertyType: "1BHK", bedroomCount: null, rooms: [
      { id: "kitchen-saved", typeId: "kitchen", label: "Kitchen", length: 12, width: 8 },
      { id: "bedroom-saved", typeId: "bedroom2", label: "Guest bedroom", length: 14, width: 10 }
    ] });
    expect(screen.getByText(/Previously selected rooms are kept/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    expect(within(screen.getByRole("group", { name: "Previously selected" })).getByRole("option", { name: "Guest bedroom" })).toHaveAttribute("aria-selected", "true");
  });

  it("adds a selected room once with a stable new ID while preserving other saved rooms", async () => {
    const user = userEvent.setup();
    const { latest } = mount();
    await user.click(screen.getByRole("button", { name: "Select rooms" }));
    await user.click(screen.getByRole("option", { name: "Bedroom 1" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    const newRoom = latest().rooms.find((room) => room.typeId === "master")!;
    expect(newRoom.id).toMatch(/^master-/);
    expect(newRoom).toMatchObject({ label: "Bedroom 1", length: null, width: null });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Bedroom 1 length" }), { target: { value: "18" } });
    expect(latest().rooms.find((room) => room.typeId === "master")).toMatchObject({ id: newRoom.id, length: 18 });
    expect(latest().rooms.find((room) => room.id === "bedroom-saved")).toMatchObject({ length: 14, width: 10 });
  });

  it("validates variable bedroom input and dimensions without losing invalid input", async () => {
    const user = userEvent.setup();
    const { latest } = mount();
    await user.click(screen.getByRole("button", { name: "Property type: 2BHK" }));
    await user.click(screen.getByRole("option", { name: "Villa" }));
    const bedrooms = screen.getByRole("spinbutton", { name: "Number of bedrooms" });
    expect(screen.getByRole("button", { name: /^(Continue to items|Save and continue to items)$/ })).toBeDisabled();
    fireEvent.change(bedrooms, { target: { value: "1.5" } });
    expect(bedrooms).toHaveValue(1.5);
    expect(bedrooms).toHaveAttribute("aria-invalid", "true");
    expect(latest().bedroomCount).toBeNull();
    fireEvent.change(bedrooms, { target: { value: "3" } });
    expect(latest().bedroomCount).toBe(3);
    expect(screen.getByRole("button", { name: /^(Continue to items|Save and continue to items)$/ })).toBeEnabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Kitchen length" }), { target: { value: "1000001" } });
    expect(screen.getByRole("button", { name: /^Save (and continue to items|setup changes)$/ })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("up to 1,000,000 ft");
  });

  it("keeps legacy null types and duplicate room types separate without guessing from labels", async () => {
    const user = userEvent.setup();
    const data = fixture();
    data.detail.setup!.rooms.push({ id: "legacy-room", typeId: null, label: "Kitchen", length: null, width: null, sqft: 45, canRemove: true, removalBlockedReason: null });
    data.detail.setup!.rooms.push({ id: "other-kitchen", typeId: "kitchen", label: "Pantry", length: 6, width: 4, sqft: 24, canRemove: true, removalBlockedReason: null });
    data.catalogue.setup = structuredClone(data.detail.setup!);
    const { latest } = mount(data);
    await user.click(screen.getByRole("button", { name: "Add Painting" }));
    expect(latest().rooms.find((room) => room.id === "legacy-room")).toEqual({ id: "legacy-room", typeId: null, label: "Kitchen", length: null, width: null });
    expect(latest().rooms.find((room) => room.id === "other-kitchen")).toMatchObject({ typeId: "kitchen", label: "Pantry" });
    expect(screen.getByRole("list", { name: "Selected rooms" }).children).toHaveLength(4);
  });

  it("requires room-removal confirmation and restores focus when the Client keeps the room", async () => {
    const user = userEvent.setup();
    const { changes, latest } = mount();
    const trigger = screen.getByRole("button", { name: "Remove Kitchen room" });
    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "Remove selected rooms?" });
    expect(within(dialog).getByText(/1 saved visible item is/)).toBeVisible();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Keep selection" })).toHaveFocus());
    await user.click(within(dialog).getByRole("button", { name: "Keep selection" }));
    expect(trigger).toHaveFocus();
    expect(changes).toEqual([]);
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Remove from estimate" }));
    expect(latest().rooms.map((room) => room.id)).toEqual(["bedroom-saved"]);
  });

  it("counts all saved visible basket items despite search and keeps removed siblings excluded on re-add", async () => {
    const user = userEvent.setup();
    const { latest, props } = mount();
    await user.type(screen.getByRole("searchbox", { name: "Search baskets" }), "Woodwork");
    await user.click(screen.getByRole("button", { name: "Added Woodwork" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("2 saved visible items are in this selection");
    await user.click(screen.getByRole("button", { name: "Remove from estimate" }));
    expect(latest().selectedMainBasketIds).toEqual([]);
    expect(screen.queryByRole("button", { name: /^(Continue to items|Save and continue to items)$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save setup changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Add Woodwork" }));
    expect(latest().selectedMainBasketIds).toEqual(["woodwork"]);
    expect(latest()).not.toHaveProperty("lines");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("blocks protected room and basket removals with a generic message and preserves the complete draft", async () => {
    const user = userEvent.setup();
    const data = fixture();
    data.catalogue.setup.rooms[0]!.canRemove = false;
    data.catalogue.setup.rooms[0]!.removalBlockedReason = "team_review_required";
    data.catalogue.baskets[0]!.canRemove = false;
    const { changes } = mount(data);
    await user.click(screen.getByRole("button", { name: "Remove Kitchen room" }));
    expect(screen.getByRole("alert")).toHaveTextContent("needs team review");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Added Woodwork" }));
    expect(screen.getByRole("button", { name: "Added Woodwork" })).toHaveAttribute("aria-pressed", "true");
    expect(changes).toEqual([]);
    expect(screen.queryByText("team_review_required")).not.toBeInTheDocument();
  });

  it("preserves a local draft and disables actions after a failed or stale catalogue refresh", async () => {
    const user = userEvent.setup();
    const { props, refresh, latest } = mount();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Kitchen width" }), { target: { value: "15" } });
    refresh({ catalogueError: "Available items could not be refreshed. Try again." });
    expect(screen.getByRole("spinbutton", { name: "Kitchen width" })).toHaveValue(15);
    expect(screen.getByRole("button", { name: /^Save (and continue to items|setup changes)$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Painting" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry setup" }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
    refresh({ catalogue: { ...props.catalogue!, setup: { ...props.catalogue!.setup, sourceToken: "new-source" } } });
    expect(screen.getByRole("alert")).toHaveTextContent("Your edits are kept");
    expect(latest().sourceToken).toBe("setup-source");
    expect(screen.getByRole("button", { name: /^(Continue to items|Save and continue to items)$/ })).toBeDisabled();
  });

  it("does not display another estimate's catalogue or manufacture missing setup defaults", () => {
    const data = fixture();
    const { refresh } = mount({ ...data, catalogue: { ...data.catalogue, estimateId: "other-estimate" } });
    expect(screen.queryByRole("button", { name: "Add Painting" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Property type: 2BHK" })).toBeDisabled();
    refresh({ detail: { ...data.detail, setup: undefined }, catalogue: data.catalogue });
    expect(screen.getByText(/Saved estimate setup is unavailable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Property type:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Painting" })).toBeDisabled();
  });

  it("offers a single setup-only save when no rooms or baskets permit continuation", async () => {
    const data = fixture();
    data.detail.setup!.rooms = [];
    data.detail.setup!.selectedMainBasketIds = [];
    data.catalogue.setup = structuredClone(data.detail.setup!);
    const { props } = mount(data);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Property type: 2BHK" }));
    await user.click(screen.getByRole("option", { name: "Studio" }));
    expect(screen.getByRole("button", { name: "Save setup changes" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^(Continue to items|Save and continue to items)$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Save (and continue to items|setup changes)$/ }));
    expect(props.onSave).toHaveBeenCalledWith(false);
  });

  it("keeps unavailable and locked options readable without allowing selection", () => {
    const data = fixture();
    data.catalogue.baskets[1]!.canSelect = false;
    const { refresh } = mount(data);
    expect(screen.getByRole("button", { name: "Add Painting" })).toBeDisabled();
    refresh({ disabled: true });
    expect(screen.getByRole("spinbutton", { name: "Kitchen length" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Added Woodwork" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Return to saved items" })).toBeEnabled();
  });

  it("keeps loading and empty-catalogue states explicit and names draft discard before returning", async () => {
    const user = userEvent.setup();
    const { props, refresh } = mount({ catalogue: undefined, loading: true });
    expect(screen.getByText("Loading configured baskets…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Property type: 2BHK" })).toBeDisabled();
    const data = fixture();
    refresh({ catalogue: { ...data.catalogue, baskets: [] }, loading: false });
    expect(screen.getByText("No Main Baskets are currently available for your estimate.")).toBeVisible();
    expect(screen.getByRole("button", { name: /^(Continue to items|Save and continue to items)$/ })).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Kitchen width" }), { target: { value: "20" } });
    await user.click(screen.getByRole("button", { name: "Discard setup changes and return" }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("exposes named keyboard controls and an accessible removal dialog", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Remove Kitchen room" }));
    const dialog = screen.getByRole("alertdialog");
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Remove Kitchen room" })).toHaveFocus();
  });
});
