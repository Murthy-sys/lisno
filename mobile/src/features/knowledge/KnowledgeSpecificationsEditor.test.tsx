import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { KnowledgeJsonObject } from "../../../../shared/knowledge/knowledgeTypes";
import { KnowledgeSpecificationsEditor } from "./KnowledgeSpecificationsEditor";

const brands = [
  { id: "private-z", name: "Zinc" },
  { id: "private-a", name: "Amber" },
  { id: "private-unused", name: "Unused Brand" }
];
const multiPayload: KnowledgeJsonObject = {
  brands,
  specifications: [{ id: "private-spec", name: "Wall paint", brandIds: ["private-z", "private-a"], description: "Two coats", type: "text", value: "Retained legacy detail" }]
};

async function setup(payload: KnowledgeJsonObject = multiPayload) {
  const onChange = jest.fn();
  function Harness({ readOnly = false }: { readonly readOnly?: boolean }) {
    const [current, setCurrent] = useState(payload);
    return <KnowledgeSpecificationsEditor payload={current} readOnly={readOnly} onChange={next => { onChange(next); setCurrent(next); }} />;
  }
  const result = await render(<Harness />);
  return { onChange, readOnly: () => result.rerender(<Harness readOnly />) };
}

it("renders every web-selected Brand and preserves its IDs and legacy fields through item edits", async () => {
  const { onChange } = await setup();
  expect(screen.getByText("Brands: Zinc, Amber")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Brand 1" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove Brand 2" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove Brand 3" })).not.toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Edit Specification 1" }));
  expect(screen.queryByRole("combobox", { name: "Brand" })).toBeNull();
  expect(screen.getByText(/Manage this item's brand choices in web Configuration/u)).toBeTruthy();
  for (const button of screen.getAllByRole("button", { name: "Add Brand" })) {
    expect(button).toBeDisabled();
    await fireEvent.press(button);
  }
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Item name"), "Exterior paint");
  await fireEvent.changeText(screen.getByLabelText("Brief description"), "Three coats");
  const saved = onChange.mock.lastCall?.[0] as KnowledgeJsonObject;
  expect(saved.specifications).toEqual([{ id: "private-spec", name: "Exterior paint", brandIds: ["private-z", "private-a"], description: "Three coats", type: "text", value: "Retained legacy detail" }]);
  expect(saved.brands).toEqual(brands);
});

it("updates every reference when a second selected Brand is renamed", async () => {
  const { onChange } = await setup({ ...multiPayload, specifications: [
    ...(multiPayload.specifications as KnowledgeJsonObject[]),
    { id: "private-other-spec", name: "Primer", brandId: "private-a" }
  ] });
  await fireEvent.press(screen.getByRole("button", { name: "Edit Brand 2" }));
  await fireEvent.changeText(screen.getByLabelText("Brand name"), "Amber renamed");
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Brands: Zinc, Amber renamed")).toBeTruthy();
  expect(screen.getByText("Brands: Amber renamed")).toBeTruthy();
  expect((onChange.mock.lastCall?.[0] as KnowledgeJsonObject).specifications).toEqual([
    ...(multiPayload.specifications as KnowledgeJsonObject[]), { id: "private-other-spec", name: "Primer", brandId: "private-a" }
  ]);
});

it.each<KnowledgeJsonObject>([{}, { brandId: "private-z" }, { brandIds: ["private-z"] }])(
  "keeps zero and one Brand selection editable and writes only one association representation: %j",
  async association => {
    const { onChange } = await setup({ brands, specifications: [{ id: "private-spec", name: "Paint", ...association }] });
    await fireEvent.press(screen.getByRole("button", { name: "Edit Specification 1" }));
    await fireEvent.press(screen.getByRole("combobox", { name: "Brand" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Amber" }));
    expect((onChange.mock.lastCall?.[0] as KnowledgeJsonObject).specifications).toEqual([{ id: "private-spec", name: "Paint", brandId: "private-a" }]);
    await fireEvent.press(screen.getByRole("combobox", { name: "Brand" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Not configured" }));
    expect((onChange.mock.lastCall?.[0] as KnowledgeJsonObject).specifications).toEqual([{ id: "private-spec", name: "Paint" }]);
    await fireEvent.press(screen.getAllByRole("button", { name: "Add Brand" }).at(-1)!);
    const latest = onChange.mock.lastCall?.[0] as KnowledgeJsonObject;
    const addedBrand = (latest.brands as KnowledgeJsonObject[]).at(-1)!;
    expect(latest.specifications).toEqual([{ id: "private-spec", name: "Paint", brandId: addedBrand.id }]);
    expect(addedBrand.name).toBe("");
  }
);

it("blocks an already-open single-choice action when permissions become read-only", async () => {
  const { onChange, readOnly } = await setup({ brands, specifications: [{ id: "private-spec", name: "Paint", brandId: "private-z" }] });
  await fireEvent.press(screen.getByRole("button", { name: "Edit Specification 1" }));
  await fireEvent.press(screen.getByRole("combobox", { name: "Brand" }));
  await readOnly();
  await fireEvent.press(screen.getByRole("radio", { name: "Amber" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("combobox", { name: "Brand" })).toBeDisabled();
  expect(screen.getByLabelText("Item name")).toHaveProp("editable", false);
  expect(screen.queryByRole("button", { name: "Add Brand" })).toBeNull();
});

it("keeps all multi-brand names visible in read-only mode", async () => {
  const onChange = jest.fn();
  await render(<KnowledgeSpecificationsEditor payload={multiPayload} onChange={onChange} readOnly />);
  await fireEvent.press(screen.getByRole("button", { name: "View Specification 1" }));
  expect(screen.getAllByText("Brands: Zinc, Amber").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Item name")).toHaveProp("editable", false);
  expect(screen.queryByRole("combobox", { name: "Brand" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add Brand" })).toBeNull();
  expect(screen.queryByText(/can still be edited here/u)).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

it("shows an unavailable second Brand and protects both sides of invalid mixed associations", async () => {
  await setup({ brands, specifications: [
    { id: "spec-1", name: "Paint", brandIds: ["private-z", "missing-private-brand"] },
    { id: "spec-2", name: "Primer", brandId: "private-a", brandIds: ["private-unused"] }
  ] });
  expect(screen.getByText("Brands: Zinc, Unavailable Brand")).toBeTruthy();
  expect(screen.queryByText(/missing-private-brand/u)).toBeNull();
  expect(screen.getByRole("button", { name: "Remove Brand 2" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove Brand 3" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Edit Specification 2" }));
  expect(screen.queryByRole("combobox", { name: "Brand" })).toBeNull();
  for (const button of screen.getAllByRole("button", { name: "Add Brand" })) expect(button).toBeDisabled();
});

it("rechecks all brand references before completing an open removal confirmation", async () => {
  const onChange = jest.fn();
  const { rerender } = await render(<KnowledgeSpecificationsEditor payload={multiPayload} onChange={onChange} readOnly={false} />);
  await fireEvent.press(screen.getByRole("button", { name: "Remove Brand 3" }));
  await rerender(<KnowledgeSpecificationsEditor payload={{ ...multiPayload, specifications: [
    { id: "private-spec", name: "Paint", brandIds: ["private-z", "private-unused"] }
  ] }} onChange={onChange} readOnly={false} />);
  await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
  expect(onChange).not.toHaveBeenCalled();
});
