import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "../../api/client";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import { projectProcurementKeys } from "../procurement/projectProcurementApi";
import { FurnitureUomField, type FurnitureUomFieldProps } from "./FurnitureUomField";
import { projectWorkflowKeys, type FurnitureUomOption } from "./projectWorkflowApi";

const options: FurnitureUomOption[] = [
  { id: "uom-mm", code: "mm", name: "Millimetres", decimalScale: 0 },
  { id: "uom-cm", code: "cm", name: "Centimetres", decimalScale: 3 }
];
const added: FurnitureUomOption = { id: "uom-new", code: "yd", name: "Yards", decimalScale: 3 };

function setup(overrides: Partial<FurnitureUomFieldProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onChange = vi.fn();
  const onBusyChange = vi.fn();
  const onRetry = vi.fn();
  const onSubmitParent = vi.fn();
  const props: FurnitureUomFieldProps = {
    id: "sofa-uom", projectId: "project-a", value: "", options, loading: false,
    onChange, onBusyChange, onRetry, ...overrides
  };
  function Form({ field }: { field: FurnitureUomFieldProps }) {
    const [value, setValue] = useState(field.value);
    const units = useQuery({
      queryKey: projectWorkflowKeys.furnitureUoms(field.projectId), queryFn: async () => field.options,
      initialData: field.options, enabled: false
    });
    return <form aria-label="Measurements" onSubmit={(event) => { event.preventDefault(); onSubmitParent(); }}>
      <label htmlFor="sofa-width">Width</label><input id="sofa-width" defaultValue="91.125" />
      <FurnitureUomField {...field} value={value} options={units.data} onChange={(next) => { field.onChange(next); setValue(next); }} />
    </form>;
  }
  const rendered = render(<Form field={props} />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...rendered, client, onChange, onBusyChange, onRetry, onSubmitParent, props, Form };
}

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add UOM" }));
  return within(screen.getByRole("dialog", { name: "Add UOM" }));
}

async function enterNewUnit(user: ReturnType<typeof userEvent.setup>) {
  const panel = await openAdd(user);
  await user.type(panel.getByRole("textbox", { name: "UOM code" }), "  yd  ");
  await user.type(panel.getByRole("textbox", { name: "UOM name" }), "  Yards  ");
  return panel;
}

describe("Furniture configured UOM field", () => {
  it("uses configured IDs without selecting a default or changing dimensions", async () => {
    const { onChange } = setup(); const user = userEvent.setup();
    const select = screen.getByRole("combobox", { name: "UOM" });
    expect(select).toHaveValue("");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Choose UOM", "mm · Millimetres", "cm · Centimetres"]);
    await user.selectOptions(select, "uom-cm");
    expect(onChange).toHaveBeenCalledWith("uom-cm");
    expect(screen.getByRole("textbox", { name: "Width" })).toHaveValue("91.125");
  });

  it("requires an explicit choice for a legacy string even when its code matches a configured unit", () => {
    const { onChange } = setup({ previousUnit: { code: "mm", name: "Millimetres" } });
    expect(screen.getByRole("combobox", { name: "UOM" })).toHaveValue("");
    expect(screen.getByText(/Previous unit: mm · Millimetres. Select its configured UOM/)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the unavailable prior unit visible and allows an active replacement", async () => {
    const { onChange } = setup({ value: "archived-id", previousUnit: { code: "inch", name: "Inches" } });
    const user = userEvent.setup();
    expect(screen.getByRole("option", { name: "inch · Inches (unavailable)" })).toBeDisabled();
    expect(screen.getByText(/Previously saved as inch · Inches. Choose an active UOM/)).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "UOM" }), "uom-mm");
    expect(onChange).toHaveBeenCalledWith("uom-mm");
    expect(screen.queryByText(/Previously saved as/)).not.toBeInTheDocument();
  });

  it("shows loading without incorrectly describing a saved unit as unavailable", () => {
    setup({ loading: true, options: [], value: "uom-mm", previousUnit: { code: "mm" } });
    expect(screen.getByRole("combobox", { name: "UOM" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Loading saved UOM…" })).toBeInTheDocument();
    expect(screen.queryByText(/Choose an active UOM before/)).not.toBeInTheDocument();
  });

  it("shows an actionable error and retries the shared options lookup", async () => {
    const { onRetry } = setup({ error: "UOMs could not be loaded." }); const user = userEvent.setup();
    expect(screen.getByRole("combobox", { name: "UOM" })).toBeDisabled();
    expect(screen.getByText("UOMs could not be loaded.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry UOMs" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers adding the first configured unit when the active catalog is empty", () => {
    setup({ options: [] });
    expect(screen.getByText("No active UOMs. Add a unit to continue.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add UOM" })).toBeEnabled();
  });

  it("saves through the scoped API, selects the unit, refreshes catalogs and never submits the parent form", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ uom: added, reused: false });
    const { client, onChange, onBusyChange, onSubmitParent } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries"); const user = userEvent.setup();
    const panel = await enterNewUnit(user);
    expect(panel.getByRole("combobox", { name: "Quantity decimal places" })).toHaveValue("3");
    expect(panel.getByText(/even if you later cancel the furniture submission/)).toBeVisible();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await user.click(panel.getByRole("button", { name: "Save UOM" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add UOM" })).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledWith("/projects/project-a/design-workflow/furniture-uoms", { code: "yd", name: "Yards", decimalScale: 3 }, expect.anything());
    expect(onChange).toHaveBeenCalledWith(added.id);
    expect(screen.getByRole("combobox", { name: "UOM" })).toHaveValue(added.id);
    expect(client.getQueryData(projectWorkflowKeys.furnitureUoms("project-a"))).toEqual([...options, added]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.allFurnitureUoms() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: projectProcurementKeys.uoms });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: knowledgeQueryKeys.masterLists("uoms") });
    expect(screen.getByRole("status")).toHaveTextContent("saved in Configuration for future projects");
    expect(screen.getByRole("textbox", { name: "Width" })).toHaveValue("91.125");
    expect(onSubmitParent).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("reuses an existing UOM without replacing its saved quantity precision", async () => {
    const existing = options[0]!;
    vi.spyOn(apiClient, "post").mockResolvedValue({ uom: existing, reused: true });
    const { client } = setup(); const user = userEvent.setup(); const panel = await openAdd(user);
    await user.type(panel.getByRole("textbox", { name: "UOM code" }), "mm");
    await user.type(panel.getByRole("textbox", { name: "UOM name" }), "Millimetres");
    await user.click(panel.getByRole("button", { name: "Save UOM" }));
    expect(await screen.findByRole("status")).toHaveTextContent("already exists and is now selected. Its saved settings were kept.");
    expect(screen.getByRole("combobox", { name: "UOM" })).toHaveValue(existing.id);
    expect(client.getQueryData(projectWorkflowKeys.furnitureUoms("project-a"))).toEqual(options);
  });

  it("preserves both unit and measurement drafts after a failed save and permits retry", async () => {
    const post = vi.spyOn(apiClient, "post").mockRejectedValueOnce(new ApiError(409, "UOM_CONFLICT", "This UOM code is used by another name.")).mockResolvedValueOnce({ uom: added, reused: false });
    const { onChange } = setup(); const user = userEvent.setup(); const panel = await enterNewUnit(user);
    await user.click(panel.getByRole("button", { name: "Save UOM" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This UOM code is used by another name.");
    expect(panel.getByRole("textbox", { name: "UOM code" })).toHaveValue("  yd  ");
    expect(panel.getByRole("textbox", { name: "UOM name" })).toHaveValue("  Yards  ");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(panel.getByRole("button", { name: "Save UOM" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add UOM" })).not.toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("textbox", { name: "Width" })).toHaveValue("91.125");
  });

  it("validates required labels, focuses the invalid field and reports no accessibility violations", async () => {
    const post = vi.spyOn(apiClient, "post"); setup(); const user = userEvent.setup(); const panel = await openAdd(user);
    await user.click(panel.getByRole("button", { name: "Save UOM" }));
    expect(panel.getByText("Enter a UOM code of up to 64 characters.")).toBeVisible();
    expect(panel.getByText("Enter a UOM name of up to 240 characters.")).toBeVisible();
    expect(panel.getByRole("textbox", { name: "UOM code" })).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("protects unsaved unit changes and restores the measurement draft on discard", async () => {
    const post = vi.spyOn(apiClient, "post"); const { onBusyChange } = setup(); const user = userEvent.setup(); const panel = await enterNewUnit(user);
    await user.click(panel.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(panel.getByRole("textbox", { name: "UOM name" })).toHaveValue("  Yards  ");
    await user.click(panel.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "Add UOM" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Width" })).toHaveValue("91.125");
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("prevents duplicate save and dismissal while pending and resets parent busy on unmount", async () => {
    vi.spyOn(apiClient, "post").mockImplementation(() => new Promise(() => {}));
    const { onBusyChange, unmount } = setup(); const user = userEvent.setup(); const panel = await enterNewUnit(user);
    await user.click(panel.getByRole("button", { name: "Save UOM" }));
    await waitFor(() => expect(panel.getByRole("button", { name: "Save UOM" })).toBeDisabled());
    expect(panel.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Add UOM" })).toBeInTheDocument();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    unmount(); expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("stops creation if the parent workflow becomes stale while the add panel is open", async () => {
    const post = vi.spyOn(apiClient, "post"); const { rerender, Form, props } = setup(); const user = userEvent.setup();
    await enterNewUnit(user); rerender(<Form field={{ ...props, disabled: true }} />);
    const panel = within(screen.getByRole("dialog", { name: "Add UOM" }));
    expect(panel.getByRole("button", { name: "Save UOM" })).toBeDisabled();
    expect(panel.getByRole("textbox", { name: "UOM name" })).toBeDisabled();
    fireEvent.submit(panel.getByRole("textbox", { name: "UOM name" }).closest("form")!);
    expect(post).not.toHaveBeenCalled();
    expect(panel.getByText(/measurement form is no longer editable/)).toBeVisible();
  });
});
