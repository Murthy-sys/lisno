import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionCode } from "../../api/authorization-contract";
import type { ProcurementProject, ProjectProcurementItem } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { EstimateProcurementItems } from "./EstimateProcurementItems";

let permissions: PermissionCode[];
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ authorization: { role: "procurement", permissions } }) }));
const uom = { id: "uom-one", code: "nos", name: "Number", status: "active" as const };
const project: ProcurementProject = {
  projectId: "project-one", projectName: "Project One", estimateId: "estimate-one", estimateVersion: 3,
  taskId: "task-one", taskVersion: 1, taskStatus: "open", taskProgress: 0, openedAt: "2026-09-18T00:00:00Z", updatedAt: "2026-09-18T00:00:00Z",
  sections: [{ id: "CA", label: "Carpentry", estimatedAmountPaise: 455055, actualSpendPaise: 0, items: [
    { key: "line-one", catalogueId: "CA01", specification: "Wardrobe", roomName: "Bedroom", quantity: 2, unit: "nos", estimatedAmountPaise: 125050, actualSpendPaise: 0, expenses: [] },
    { key: "line-two", catalogueId: "CA01", specification: "TV cabinet", roomName: "Living room", quantity: 1, unit: "lot", estimatedAmountPaise: 330005, actualSpendPaise: 0, expenses: [] },
    { key: "line-zero", catalogueId: "CA03", specification: "Provisional shelf", roomName: "Kitchen", quantity: 0, unit: "nos", estimatedAmountPaise: 0, actualSpendPaise: 0, expenses: [] }
  ] }]
};
const source = (key: string) => ({ estimateId: "estimate-one", estimateVersion: 3, sourceLineItemKey: key });
function item(id: string, key: string | null, price = 12505): ProjectProcurementItem {
  return { id, projectId: "project-one", itemName: "Plywood", brand: "Sample", uom, vendor: null, pricePaise: price, version: 2,
    estimateSource: key ? { ...source(key), estimateReviewRoundId: "round-one", sourceSectionId: "CA" } : null,
    createdAt: "2026-09-18T00:00:00Z", updatedAt: "2026-09-18T00:00:00Z" };
}
let rows: ProjectProcurementItem[];
let reads: URLSearchParams[];
let writes: Array<Record<string, unknown>>;
function start() {
  let change!: (next: ProcurementProject) => void;
  function Harness() { const [value, set] = useState(project); change = set; return <EstimateProcurementItems project={value} />; }
  const view = renderWithQuery(<Harness />);
  return { ...view, change: (next: ProcurementProject) => act(() => change(next)) };
}
const parent = (name: string) => screen.getByRole("group", { name: `${name} — ${project.sections[0]!.items.find((line) => line.specification === name)!.roomName}` });
async function fillNew(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Item name" }), "Plywood");
  await user.type(screen.getByRole("textbox", { name: "Brand" }), "Sample");
  await user.selectOptions(screen.getByRole("combobox", { name: "UOM" }), "uom-one");
  await user.type(screen.getByRole("textbox", { name: "Price (INR)" }), "880.01");
}
beforeEach(() => {
  permissions = ["procurement.items.read", "procurement.items.manage", "procurement.vendors.read", "procurement.vendors.create"];
  rows = [item("child-one", "line-one")]; reads = []; writes = [];
  server.use(
    http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: [uom] })),
    http.get("/api/v1/procurement/vendors", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } })),
    http.get("/api/v1/procurement/projects/project-one/items", ({ request }) => {
      const params = new URL(request.url).searchParams; reads.push(params);
      const matches = rows.filter((row) => params.get("unassigned") === "true" ? !row.estimateSource : row.estimateSource?.sourceLineItemKey === params.get("sourceLineItemKey"));
      const q = params.get("q") ?? ""; const filtered = matches.filter((row) => row.itemName.toLowerCase().includes(q.toLowerCase()));
      const offset = Number(params.get("offset") ?? 0);
      return HttpResponse.json({ data: { items: filtered.slice(offset, offset + 20), total: filtered.length, limit: 20, offset } });
    }),
    http.post("/api/v1/procurement/projects/project-one/items", async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; writes.push(body);
      const saved = { ...item(`saved-${rows.length}`, String(body.sourceLineItemKey), Number(body.pricePaise)), itemName: String(body.itemName), brand: String(body.brand) };
      rows.push(saved); return HttpResponse.json({ data: saved }, { status: 201 });
    })
  );
});

describe("Estimate-linked procurement groups", () => {
  it("shows exact unequal approved budgets including zero and loads children only when opened", async () => {
    start();
    expect(within(parent("Wardrobe")).getByText("₹1,250.50")).toBeVisible();
    expect(within(parent("TV cabinet")).getByText("₹3,300.05")).toBeVisible();
    expect(within(parent("Provisional shelf")).getByText("₹0.00")).toBeVisible();
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]?.get("unassigned")).toBe("true");
    expect(screen.queryByText("Plywood")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record purchase/ })).not.toBeInTheDocument();
    await userEvent.setup().click(within(parent("Wardrobe")).getByRole("button", { name: /View procurement items/ }));
    expect(await within(parent("Wardrobe")).findByRole("rowheader", { name: "Plywood" })).toBeVisible();
    const request = reads.find((entry) => entry.get("sourceLineItemKey") === "line-one")!;
    expect(Object.fromEntries(request)).toEqual({ q: "", limit: "20", offset: "0", estimateId: "estimate-one", estimateVersion: "3", sourceLineItemKey: "line-one" });
  });

  it("saves a child under exactly its chosen parent and keeps unit prices separate from the budget", async () => {
    start(); const user = userEvent.setup();
    await user.click(within(parent("TV cabinet")).getByRole("button", { name: /Add item under/ }));
    await fillNew(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" }));
    expect(await within(parent("TV cabinet")).findByRole("rowheader", { name: "Plywood" })).toBeVisible();
    expect(writes).toEqual([{ ...source("line-two"), itemName: "Plywood", brand: "Sample", uomId: "uom-one", vendorId: null, pricePaise: 88001 }]);
    expect(within(parent("TV cabinet")).getByText("₹3,300.05")).toBeVisible();
    expect(within(parent("TV cabinet")).getByText("₹880.01")).toBeVisible();
    await user.click(within(parent("Wardrobe")).getByRole("button", { name: /View procurement items/ }));
    expect(await within(parent("Wardrobe")).findByText("₹125.05")).toBeVisible();
    expect(within(parent("Wardrobe")).queryByText("₹880.01")).not.toBeInTheDocument();
    expect(screen.queryByText(/Remaining|Recorded spend/)).not.toBeInTheDocument();
  });

  it("paginates and searches within one parent without dropping rows after the first twenty", async () => {
    rows = Array.from({ length: 21 }, (_, index) => ({ ...item(`child-${index}`, "line-one"), itemName: `Board ${index + 1}` }));
    start(); const user = userEvent.setup(); const group = parent("Wardrobe");
    await user.click(within(group).getByRole("button", { name: /View procurement items/ }));
    await user.click(await within(group).findByRole("button", { name: "Next" }));
    expect(await within(group).findByRole("rowheader", { name: "Board 21" })).toBeVisible();
    await user.type(within(group).getByRole("searchbox"), "Board 7");
    await user.click(within(group).getByRole("button", { name: "Search" }));
    expect(await within(group).findByRole("rowheader", { name: "Board 7" })).toBeVisible();
    expect(reads.filter((entry) => entry.get("unassigned") !== "true").every((entry) => entry.get("sourceLineItemKey") === "line-one" && entry.get("estimateVersion") === "3")).toBe(true);
    expect(reads.some((entry) => entry.get("offset") === "20")).toBe(true);
    expect(reads.some((entry) => entry.get("q") === "Board 7" && entry.get("offset") === "0")).toBe(true);
  });

  it("rejects a child response from another estimate parent", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/items", ({ request }) => {
      const unassigned = new URL(request.url).searchParams.has("unassigned");
      return HttpResponse.json({ data: { items: unassigned ? [] : [item("wrong", "line-two")], total: unassigned ? 0 : 1, limit: 20, offset: 0 } });
    }));
    start(); const group = parent("Wardrobe");
    await userEvent.setup().click(within(group).getByRole("button", { name: /View procurement items/ }));
    expect(await within(group).findByRole("alert")).toHaveTextContent("Procurement items could not be loaded");
    expect(within(group).queryByRole("table")).not.toBeInTheDocument();
  });

  it("preserves the open draft and blocks saving when its parent estimate version changes", async () => {
    const view = start(); const user = userEvent.setup();
    await user.click(within(parent("Wardrobe")).getByRole("button", { name: /Add item under/ }));
    await fillNew(user);
    view.change({ ...project, estimateVersion: 4 });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Item name" })).toHaveValue("Plywood");
    expect(within(dialog).getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Your entries are preserved");
    expect(writes).toHaveLength(0);
  });

  it("keeps legacy rows visible and attaches them only on explicit assignment with their version", async () => {
    rows = [item("legacy", null)];
    const patches: unknown[] = [];
    server.use(http.patch("/api/v1/procurement/projects/project-one/items/legacy", async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; patches.push(body);
      rows = [item("legacy", String(body.sourceLineItemKey))];
      return HttpResponse.json({ data: rows[0] });
    }));
    start(); const user = userEvent.setup();
    const legacy = await screen.findByRole("region", { name: "Items needing assignment" });
    await user.click(await within(legacy).findByRole("button", { name: "Edit Plywood, Sample" }));
    expect(screen.getByRole("combobox", { name: "Estimate item" })).toHaveValue("");
    expect(patches).toHaveLength(0);
    await user.selectOptions(screen.getByRole("combobox", { name: "Estimate item" }), "line-two");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patches).toEqual([{ ...source("line-two"), itemName: "Plywood", brand: "Sample", uomId: "uom-one", vendorId: null, pricePaise: 12505, expectedVersion: 2 }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(within(parent("TV cabinet")).getByRole("button", { name: /View procurement items/ }));
    expect(await within(parent("TV cabinet")).findByRole("rowheader", { name: "Plywood" })).toBeVisible();
  });

  it("disables a source-conflicted draft and removes the form when manage access is revoked", async () => {
    server.use(http.post("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_SOURCE_CONFLICT", message: "Source changed" } }, { status: 409 })));
    const view = start(); const user = userEvent.setup();
    await user.click(within(parent("Wardrobe")).getByRole("button", { name: /Add item under/ }));
    await fillNew(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Your entries are preserved");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" })).toBeDisabled();
    permissions = ["procurement.items.read"];
    view.change({ ...project });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add item under/ })).not.toBeInTheDocument();
  });
});
