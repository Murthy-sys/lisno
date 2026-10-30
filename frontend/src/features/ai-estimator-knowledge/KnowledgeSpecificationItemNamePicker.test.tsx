import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { Field } from "../../components/ui/Field";
import { collectSpecificationItemNames, matchSpecificationItemNames, normalizeSpecificationItemName } from "../../../../shared/knowledge/knowledgeSpecificationItemNames";
import { KnowledgeSpecificationItemNamePicker } from "./KnowledgeSpecificationItemNamePicker";
import { KnowledgeSpecificationBuilder } from "./KnowledgeSpecificationBuilder";
import type { KnowledgeSpecificationItemNameLookup } from "./knowledgeEditorDataSource";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeJsonValue, KnowledgeSpecificationItemNameListParams, KnowledgeSpecificationItemNameListResponse } from "./knowledgeTypes";

function response(names: string[], params: KnowledgeSpecificationItemNameListParams = {}): KnowledgeSpecificationItemNameListResponse {
  const all = collectSpecificationItemNames(names);
  const items = all.filter((item) => normalizeSpecificationItemName(item.name).includes(normalizeSpecificationItemName(params.search ?? "")));
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;
  return { items: items.slice(offset, offset + limit), pagination: { offset, limit, total: items.length, hasMore: offset + limit < items.length },
    ...(params.checkName ? matchSpecificationItemNames(all, params.checkName) : { exactMatch: null, similarItems: [] }) };
}

function setup({ value = "Legacy finish", names = ["Plywood", "Laminate"], draftNames = [], otherRowNames = [], list, readOnly = false }: {
  value?: string; names?: string[]; draftNames?: string[]; otherRowNames?: string[]; list?: KnowledgeSpecificationItemNameLookup["list"]; readOnly?: boolean;
} = {}) {
  const onChange = vi.fn();
  const reader = vi.fn(list ?? (async (params = {}) => response(names, params)));
  const lookup: KnowledgeSpecificationItemNameLookup = { queryKey: knowledgeQueryKeys.specificationItemNameList, list: reader };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ref = createRef<HTMLButtonElement>();
  function Harness({ locked = readOnly }: { locked?: boolean }) {
    const [selected, setSelected] = useState(value);
    return <QueryClientProvider client={client}><main><Field id="item" label="Item name" required>{(field) =>
      <KnowledgeSpecificationItemNamePicker {...field} ref={ref} value={selected} draftNames={draftNames} otherRowNames={otherRowNames} lookup={lookup} readOnly={locked}
        onChange={(name) => { onChange(name); setSelected(name); }} />}</Field></main></QueryClientProvider>;
  }
  const rendered = render(<Harness />);
  return { ...rendered, reader, client, ref, onChange, lookup, Harness, user: userEvent.setup() };
}

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Item name" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add item" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Add item" }));
  return screen.getByRole("dialog", { name: "Add item" });
}

describe("Specification item name picker", () => {
  it("sends valid Unicode input without expanding it beyond the API character limit", async () => {
    const name = "ﬃ".repeat(81);
    expect(normalizeSpecificationItemName(name)).toHaveLength(243);
    const { user, reader, onChange } = setup({ list: async (params = {}) => {
      if ((params.search?.length ?? 0) > 240) throw new ApiError(400, "VALIDATION_ERROR", "Search too long");
      return response([name], params);
    } });
    await user.click(screen.getByRole("button", { name: "Item name" }));
    await user.type(screen.getByRole("searchbox", { name: "Search items" }), name);
    await waitFor(() => expect(reader).toHaveBeenCalledWith(expect.objectContaining({ search: name }), expect.anything()));
    await user.click(await screen.findByRole("option", { name }));
    expect(onChange).toHaveBeenCalledWith(name);
  });
  it("keeps legacy spelling, loads on opening, and separates search from selection", async () => {
    const { user, reader, onChange, ref } = setup({ value: " Legacy  spelling " });
    expect(reader).not.toHaveBeenCalled();
    expect(ref.current).toHaveTextContent("Legacy spelling");
    expect(ref.current?.textContent).toBe(" Legacy  spelling ");
    await user.click(screen.getByRole("button", { name: "Item name" }));
    await user.type(screen.getByRole("searchbox", { name: "Search items" }), "ply");
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("option", { name: "Plywood" })).toBeEnabled());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("Plywood");
    expect(ref.current).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("merges draft choices, disables duplicate rows, and loads later pages without using local counts", async () => {
    const names = Array.from({ length: 25 }, (_, index) => `Saved item ${String(index).padStart(2, "0")}`);
    const { user, reader } = setup({ names, draftNames: ["Local item", "local   ITEM"], otherRowNames: [" local item "] });
    await user.click(screen.getByRole("button", { name: "Item name" }));
    expect(await screen.findByRole("option", { name: "Local item Already included" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Load more items" }));
    expect(await screen.findByRole("option", { name: "Saved item 24" })).toBeEnabled();
    expect(reader).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }), expect.anything());
    expect(screen.getAllByRole("option")).toHaveLength(26);
  });

  it("keeps focus and the list open while loading an asynchronous final page", async () => {
    const names = Array.from({ length: 21 }, (_, index) => `Saved item ${String(index).padStart(2, "0")}`);
    let finishPage!: (response: KnowledgeSpecificationItemNameListResponse) => void;
    const { user } = setup({ list: async (params = {}) => params.offset
      ? new Promise(resolve => { finishPage = resolve; })
      : response(names, params) });
    await user.click(screen.getByRole("button", { name: "Item name" }));
    const loadMore = await screen.findByRole("button", { name: "Load more items" });
    await user.click(loadMore);
    expect(loadMore).toBeDisabled();
    expect(screen.getByRole("searchbox", { name: "Search items" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Item name" })).toHaveAttribute("aria-expanded", "true");
    await act(async () => finishPage(response(names, { offset: 20 })));
    expect(await screen.findByRole("option", { name: "Saved item 20" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Load more items" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search items" })).toHaveFocus();
  });

  it("adds into the current draft only and Cancel restores the trigger without changing it", async () => {
    const { user, onChange, reader, ref } = setup({ names: [] });
    let dialog = await openAdd(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "Abandoned");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(ref.current).toHaveFocus());
    dialog = await openAdd(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "  Door   panel  ");
    const add = within(dialog).getByRole("button", { name: "Add and select" });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Door panel");
    expect(reader.mock.calls.every(([params]) => !params || !("payload" in params))).toBe(true);
  });

  it("checks exact matches outside the page and offers the existing spelling", async () => {
    const { user, onChange } = setup({ names: ["A first option", "Plywood"], draftNames: ["PLYWOOD"] });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "  PLYwood  ");
    await user.click(await within(dialog).findByRole("button", { name: "Select Plywood" }));
    expect(onChange).toHaveBeenCalledWith("Plywood");
  });

  it("offers near matches, requires a distinct spelling confirmation, and resets it when input changes", async () => {
    const { user, onChange } = setup();
    const dialog = await openAdd(user);
    const input = within(dialog).getByRole("textbox", { name: "Item name" });
    await user.type(input, "Plywod");
    expect(await within(dialog).findByRole("button", { name: "Plywood" })).toBeEnabled();
    const add = within(dialog).getByRole("button", { name: "Add and select" });
    expect(add).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "Use “Plywod” as a different item" }));
    expect(add).toBeEnabled();
    fireEvent.change(input, { target: { value: "Plywods" } });
    expect(add).toBeDisabled();
    fireEvent.change(input, { target: { value: "Plywod" } });
    await waitFor(() => expect(within(dialog).getByRole("checkbox")).not.toBeChecked());
    await user.click(within(dialog).getByRole("button", { name: "Plywood" }));
    expect(onChange).toHaveBeenCalledWith("Plywood");
  });

  it("rejects an exact local duplicate in Add item", async () => {
    const { user } = setup({ draftNames: ["Plywood"], otherRowNames: ["Plywood"] });
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "plywood");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already included");
    expect(within(dialog).getByRole("button", { name: "Add and select" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Select Plywood" })).not.toBeInTheDocument();
  });

  it("allows an explicitly confirmed distinct spelling without publishing a shared name", async () => {
    const { user, onChange, client } = setup();
    const dialog = await openAdd(user);
    await user.type(within(dialog).getByRole("textbox", { name: "Item name" }), "Plywod");
    await user.click(await within(dialog).findByRole("checkbox", { name: "Use “Plywod” as a different item" }));
    await user.click(within(dialog).getByRole("button", { name: "Add and select" }));
    expect(onChange).toHaveBeenCalledWith("Plywod");
    const savedPages = client.getQueryData<{ pages: KnowledgeSpecificationItemNameListResponse[] }>(knowledgeQueryKeys.specificationItemNameList({ search: "", limit: 20 }));
    expect(savedPages?.pages[0]?.items.map((item) => item.name)).toEqual(["Laminate", "Plywood"]);
  });

  it("fails closed on lookup failure and retries without changing the selected name", async () => {
    const reader = vi.fn<KnowledgeSpecificationItemNameLookup["list"]>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response(["Plywood"]));
    const { user, onChange } = setup({ list: reader });
    await user.click(screen.getByRole("button", { name: "Item name" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not load");
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry items" }));
    expect(await screen.findByRole("option", { name: "Plywood" })).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not use late candidate responses and blocks Add after permission loss", async () => {
    let resolveOld!: (value: KnowledgeSpecificationItemNameListResponse) => void;
    const reader: KnowledgeSpecificationItemNameLookup["list"] = async (params = {}) => {
      if (params.checkName === "Old name") return new Promise((resolve) => { resolveOld = resolve; });
      if (params.checkName === "Denied name") throw new ApiError(403, "FORBIDDEN", "Denied");
      return response([], params);
    };
    const { user, onChange } = setup({ list: reader });
    const dialog = await openAdd(user);
    const input = within(dialog).getByRole("textbox", { name: "Item name" });
    fireEvent.change(input, { target: { value: "Old name" } });
    await waitFor(() => expect(resolveOld).toBeDefined());
    fireEvent.change(input, { target: { value: "Denied name" } });
    await act(async () => resolveOld(response([], { checkName: "Old name" })));
    expect(within(dialog).getByRole("button", { name: "Add and select" })).toBeDisabled();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("no longer have access");
    expect(within(dialog).getByRole("button", { name: "Add and select" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides cached choices after access is denied on reopening and respects read-only changes", async () => {
    const reader = vi.fn<KnowledgeSpecificationItemNameLookup["list"]>().mockResolvedValueOnce(response(["Plywood"])).mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
    const { user, rerender, Harness } = setup({ list: reader });
    await user.click(screen.getByRole("button", { name: "Item name" }));
    expect(await screen.findByRole("option", { name: "Plywood" })).toBeVisible();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Item name" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer have access");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    rerender(<Harness locked />);
    expect(screen.getByRole("button", { name: "Item name" })).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("has accessible names and keyboard escape focus", async () => {
    const { user, ref } = setup();
    await user.click(screen.getByRole("button", { name: "Item name" }));
    await screen.findByRole("option", { name: "Plywood" });
    expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(ref.current).toHaveFocus();
    const dialog = await openAdd(user);
    expect(within(dialog).getByRole("textbox", { name: "Item name" })).toHaveFocus();
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("changes only a specification name while preserving IDs, brands, compatibility values and references", async () => {
    const client = new QueryClient();
    const saved: KnowledgeJsonValue[] = [{ id: "spec-a", name: "Legacy", brandId: "brand-a", description: "Keep", type: "text", value: "typed", options: [] }];
    const onChange = vi.fn();
    const lookup: KnowledgeSpecificationItemNameLookup = { queryKey: knowledgeQueryKeys.specificationItemNameList, list: async (params = {}) => response(["Plywood"], params) };
    render(<QueryClientProvider client={client}><KnowledgeSpecificationBuilder value={saved} savedValue={saved} brands={[{ id: "brand-a", name: "Brand A" }]} priceEntries={[]} referencedSpecificationIds={["spec-a"]} slabReferencedSpecificationIds={["spec-a"]} itemNameLookup={lookup} readOnly={false} onDirty={vi.fn()} onChange={onChange} /></QueryClientProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit Specification 1" }));
    await user.click(screen.getByRole("button", { name: "Item name" }));
    await user.click(await screen.findByRole("option", { name: "Plywood" }));
    expect(onChange.mock.calls[0]?.[0].specifications).toEqual([{ ...saved[0] as object, name: "Plywood" }]);
  });
});
