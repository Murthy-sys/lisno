import { QueryObserver, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionCode } from "../../api/authorization-contract";
import type { ProjectProcurementItem, ProcurementVendorOption } from "../../api/types";
import { server } from "../../test/server";
import { renderWithQuery } from "../../test/render";
import { ProjectProcurementItems } from "./ProjectProcurementItems";
import { projectProcurementKeys } from "./projectProcurementApi";
import { procurementKeys } from "./procurementApi";

let permissions: PermissionCode[] = [];
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ authorization: { role: "procurement", permissions } })
}));

const uom = { id: "uom-one", code: "sq ft", name: "Square feet", decimalScale: 2 };
const sourceFor = (projectId = "project-one") => ({ estimateId: projectId === "project-one" ? "estimate-one" : "estimate-two", estimateVersion: 3, sourceLineItemKey: "line-one" });
const storedSourceFor = (projectId = "project-one") => ({ ...sourceFor(projectId), estimateReviewRoundId: "round-one", sourceSectionId: "CA" });
const item: ProjectProcurementItem = {
  id: "item-one", projectId: "project-one", vendor: null, itemName: "Plywood", brand: "Greenply", uom: { ...uom, status: "active" },
  pricePaise: 12005, plannedOrderQuantityMilliUnits: 2000, plannedLineNetPaise: 24010,
  estimateSource: storedSourceFor(), version: 3, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z"
};

function page(items: ProjectProcurementItem[], total = items.length, offset = 0) {
  return HttpResponse.json({ data: { items, total, offset, limit: 20 } });
}

function start(projectId = "project-one", projectName = "Aurora Villa") {
  let queryClient!: QueryClient;
  let switchProject!: (project: { projectId: string; projectName: string }) => void;
  function TestProjectItems() {
    queryClient = useQueryClient();
    const [props, setProject] = useState({ projectId, projectName });
    switchProject = setProject;
    return <ProjectProcurementItems {...props} source={sourceFor(props.projectId)} />;
  }
  const view = renderWithQuery(<TestProjectItems />);
  return { ...view, queryClient, showProject: (id: string, name: string) => act(() => switchProject({ projectId: id, projectName: name })) };
}

async function edit() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Plywood, Greenply" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "UOM" })).toBeEnabled());
  return user;
}

beforeEach(() => {
  permissions = ["procurement.items.read", "procurement.items.manage", "procurement.vendors.read", "procurement.vendors.create"];
  server.use(
    http.get("/api/v1/procurement/projects/project-one/items", () => page([item])),
    http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: [uom] })),
    http.get("/api/v1/procurement/vendors", () => HttpResponse.json({ data: { items: [], total: 0, limit: 20, offset: 0 } }))
  );
});

describe("ProjectProcurementItems", () => {
  it("shows every requested field and restricts manage/read access without requesting unauthorized data", async () => {
    permissions = ["procurement.items.read"];
    const request = vi.fn(() => page([item]));
    server.use(http.get("/api/v1/procurement/projects/project-one/items", request));
    const view = start();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Plywood" })).toBeVisible();
    expect(within(table).getByText("Greenply")).toBeVisible();
    expect(within(table).getByText("sq ft")).toBeVisible();
    expect(within(table).getByText("₹120.05")).toBeVisible();
    expect(within(table).getByText("2 sq ft")).toBeVisible();
    expect(within(table).getByText("₹240.10")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Add item|Edit Plywood/ })).not.toBeInTheDocument();
    view.unmount();
    permissions = [];
    start();
    expect(screen.getByText("You do not have permission to view procurement items.")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("adds an exact normalized unit price, refreshes the table and persists on remount", async () => {
    let items: ProjectProcurementItem[] = [];
    const post = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items", () => page(items)),
      http.post("/api/v1/procurement/projects/project-one/items", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        post(body);
        const saved = { ...item, itemName: String(body.itemName), brand: String(body.brand), pricePaise: Number(body.pricePaise),
          plannedOrderQuantityMilliUnits: Number(body.plannedOrderQuantityMilliUnits), plannedLineNetPaise: 30013 };
        items = [saved];
        return HttpResponse.json({ data: saved }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    const view = start();
    await screen.findByText(/Add the first procurement item/);
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "  Ｐｌｙｗｏｏｄ   board  ");
    await user.type(screen.getByRole("textbox", { name: "Brand" }), "  Greenply ");
    await user.selectOptions(screen.getByRole("combobox", { name: "UOM" }), uom.id);
    await user.type(screen.getByRole("textbox", { name: "Price (INR)" }), "120.05");
    await user.type(screen.getByRole("textbox", { name: /Planned order quantity/ }), "2.5");
    const amountPreview = within(screen.getByRole("dialog"));
    expect(amountPreview.getByText("Planned amount, before GST").nextElementSibling).toHaveTextContent("₹300.13");
    expect(amountPreview.getByText("GST (18%)").nextElementSibling).toHaveTextContent("₹54.02");
    expect(amountPreview.getByText("Planned amount, with GST").nextElementSibling).toHaveTextContent("₹354.15");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" }));
    await screen.findByText("Plywood board added in this project.");
    expect(post).toHaveBeenCalledWith({ itemName: "Plywood board", brand: "Greenply", uomId: uom.id, vendorId: null, pricePaise: 12005, plannedOrderQuantityMilliUnits: 2500, ...sourceFor() });
    expect(screen.getByRole("rowheader", { name: "Plywood board" })).toBeVisible();
    expect(screen.getByText("₹300.13")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add item" })).toHaveFocus();
    view.unmount();
    start();
    expect(await screen.findByRole("rowheader", { name: "Plywood board" })).toBeVisible();
  });

  it("requires a planned quantity at the configured UOM precision", async () => {
    const patch = vi.fn(async ({ request }: { request: Request }) => {
      const body = await request.json() as Record<string, unknown>;
      expect(body.plannedOrderQuantityMilliUnits).toBe(1250);
      return HttpResponse.json({ data: item });
    });
    server.use(http.patch("/api/v1/procurement/projects/project-one/items/:id", patch));
    start();
    const user = await edit();
    const quantity = screen.getByRole("textbox", { name: /Planned order quantity/ });
    await user.clear(quantity);
    await user.type(quantity, "1.234");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/at most 2 decimal places/)).toBeVisible();
    expect(patch).not.toHaveBeenCalled();
    await user.clear(quantity);
    await user.type(quantity, "1.25");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
  });

  it("rejects fractional paise and excessive prices, and preserves dirty entries on close", async () => {
    const post = vi.fn();
    server.use(http.patch("/api/v1/procurement/projects/project-one/items/:id", post));
    start();
    const user = await edit();
    const price = screen.getByRole("textbox", { name: "Price (INR)" });
    for (const invalid of ["0", "1.005", "90000000000.01"]) {
      await user.clear(price);
      await user.type(price, invalid);
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      expect(await screen.findByText(/Enter a positive price up to/)).toBeVisible();
      expect(price).toHaveAttribute("aria-invalid", "true");
    }
    expect(post).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await user.click(within(confirmation).getByRole("button", { name: "Keep editing" }));
    expect(price).toHaveValue("90000000000.01");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Plywood, Greenply" })).toHaveFocus();
  });

  it("keeps a duplicate draft available for correction", async () => {
    server.use(http.patch("/api/v1/procurement/projects/project-one/items/:id", () => HttpResponse.json({
      error: { code: "PROCUREMENT_ITEM_DUPLICATE", message: "An item with this name, brand and unit already exists." }
    }, { status: 409 })));
    start();
    const user = await edit();
    await user.type(screen.getByRole("textbox", { name: "Brand" }), " Prime");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An item with this name, brand and unit already exists.");
    expect(screen.getByRole("textbox", { name: "Brand" })).toHaveValue("Greenply Prime");
    expect(screen.queryByRole("button", { name: /Reload latest/ })).not.toBeInTheDocument();
  });

  it("preserves stale edits until deliberate stable-ID reload and saves with the new version", async () => {
    const latest = { ...item, itemName: "Renamed panel", pricePaise: 18999, version: 4 };
    const writes: unknown[] = [];
    const getLatest = vi.fn(() => HttpResponse.json({ data: latest }));
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items/item-one", getLatest),
      http.patch("/api/v1/procurement/projects/project-one/items/item-one", async ({ request }) => {
        writes.push(await request.json());
        return writes.length === 1
          ? HttpResponse.json({ error: { code: "PROCUREMENT_ITEM_VERSION_CONFLICT", message: "Stale version" } }, { status: 409 })
          : HttpResponse.json({ data: { ...latest, version: 5 } });
      })
    );
    start();
    const user = await edit();
    await user.clear(screen.getByRole("textbox", { name: "Price (INR)" }));
    await user.type(screen.getByRole("textbox", { name: "Price (INR)" }), "145.01");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your entries are preserved");
    expect(screen.getByRole("textbox", { name: "Price (INR)" })).toHaveValue("145.01");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(getLatest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reload latest and replace entries" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Renamed panel"));
    expect(screen.getByRole("textbox", { name: "Price (INR)" })).toHaveValue("189.99");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes).toEqual([
      { itemName: "Plywood", brand: "Greenply", uomId: uom.id, vendorId: null, pricePaise: 14501, plannedOrderQuantityMilliUnits: 2000, expectedVersion: 3, ...sourceFor() },
      { itemName: "Renamed panel", brand: "Greenply", uomId: uom.id, vendorId: null, pricePaise: 18999, plannedOrderQuantityMilliUnits: 2000, expectedVersion: 4, ...sourceFor() }
    ]);
  });

  it("allows retaining a historical unit while preventing creation without active units", async () => {
    const oldItem = { ...item, uom: { ...uom, status: "archived" as const } };
    const write = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items", () => page([oldItem])),
      http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: [] })),
      http.patch("/api/v1/procurement/projects/project-one/items/:id", async ({ request }) => {
        write(await request.json());
        return HttpResponse.json({ data: oldItem });
      })
    );
    start();
    const user = await edit();
    expect(screen.getByRole("combobox", { name: "UOM" })).toHaveValue(uom.id);
    expect(screen.getByText(/current unit is archived/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(expect.objectContaining({ uomId: uom.id })));
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(screen.getByText(/No active units are available/)).toBeVisible();
  });

  it("submits bounded searches and changes pages without polling or per-keystroke requests", async () => {
    const requests: URL[] = [];
    server.use(http.get("/api/v1/procurement/projects/project-one/items", ({ request }) => {
      const url = new URL(request.url);
      requests.push(url);
      const offset = Number(url.searchParams.get("offset"));
      return page([{ ...item, id: `item-${offset}`, itemName: offset ? "Second page item" : "Plywood" }], 21, offset);
    }));
    start();
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.type(screen.getByRole("searchbox"), " Greenply ");
    expect(requests).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.searchParams.get("q")).toBe("Greenply");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("rowheader", { name: "Second page item" })).toBeVisible();
    expect(requests[2]!.searchParams.get("offset")).toBe("20");
    expect(requests[2]!.searchParams.get("limit")).toBe("20");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByRole("rowheader", { name: "Plywood" })).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("retries unavailable UOM options and refreshes them after a lifecycle validation failure", async () => {
    let optionsAvailable = true;
    server.use(http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Units unavailable" } }, { status: 503 })));
    start();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const panel = screen.getByRole("dialog");
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Units of measure could not be loaded");
    expect(within(panel).getByRole("button", { name: "Add item" })).toBeDisabled();
    server.use(
      http.get("/api/v1/procurement/uoms", () => HttpResponse.json({ data: optionsAvailable ? [uom] : [] })),
      http.post("/api/v1/procurement/projects/project-one/items", () => {
        optionsAvailable = false;
        return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message: "Choose an active unit.", fields: { uomId: "This unit is no longer active." } } }, { status: 400 });
      })
    );
    await user.click(screen.getByRole("button", { name: "Retry units" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "UOM" })).toBeEnabled());
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Panel");
    await user.type(screen.getByRole("textbox", { name: "Brand" }), "Brand");
    await user.selectOptions(screen.getByRole("combobox", { name: "UOM" }), uom.id);
    await user.type(screen.getByRole("textbox", { name: "Price (INR)" }), "15.99");
    await user.type(screen.getByRole("textbox", { name: /Planned order quantity/ }), "1");
    await user.click(within(panel).getByRole("button", { name: "Add item" }));
    expect(await screen.findByText("This unit is no longer active.")).toBeVisible();
    expect(await screen.findByText(/No active units are available/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Panel");
    expect(within(panel).getByRole("button", { name: "Add item" })).toBeDisabled();
  });

  it("labels cached data stale after refresh failure and hides it after denied access", async () => {
    const { queryClient } = start();
    await screen.findByRole("rowheader", { name: "Plywood" });
    server.use(http.get("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Unavailable" } }, { status: 503 })));
    await act(() => queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists("project-one") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("prices may be out of date");
    expect(screen.getByRole("rowheader", { name: "Plywood" })).toBeVisible();
    server.use(http.get("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 })));
    await act(() => queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists("project-one") }));
    expect(await screen.findByText("You do not have permission to view procurement items.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("offers retry for a failed initial load and reports an empty search", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({ error: { code: "UNAVAILABLE", message: "Items temporarily unavailable." } }, { status: 503 })));
    start();
    const user = userEvent.setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Items temporarily unavailable.");
    server.use(http.get("/api/v1/procurement/projects/project-one/items", () => page([])));
    await user.click(screen.getByRole("button", { name: "Retry items" }));
    expect(await screen.findByText(/Add the first procurement item/)).toBeVisible();
    await user.type(screen.getByRole("searchbox"), "Missing brand");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No items match your search.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeEnabled();
  });

  it.each([
    { status: 404, code: "NOT_FOUND" },
    { status: 409, code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" }
  ])("hides cached items and an open editor after $status $code and refreshes project eligibility", async ({ status, code }) => {
    const { queryClient } = start();
    const parentLoad = vi.fn(async () => []);
    const observer = new QueryObserver(queryClient, {
      queryKey: procurementKeys.projects, queryFn: parentLoad, staleTime: Infinity
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      const user = await edit();
      await user.type(screen.getByRole("textbox", { name: "Brand" }), " draft");
      await waitFor(() => expect(parentLoad).toHaveBeenCalledTimes(1));
      server.use(http.get("/api/v1/procurement/projects/project-one/items", () => HttpResponse.json({
        error: { code, message: "Project procurement is unavailable." }
      }, { status })));
      await act(() => queryClient.invalidateQueries({ queryKey: projectProcurementKeys.lists("project-one") }));
      expect(await screen.findByText("Procurement items are no longer available for this project.")).toBeVisible();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit Plywood, Greenply" })).not.toBeInTheDocument();
      await waitFor(() => expect(parentLoad).toHaveBeenCalledTimes(2));

      server.use(http.get("/api/v1/procurement/projects/project-one/items", () => page([item])));
      await user.click(screen.getByRole("button", { name: "Refresh project" }));
      expect(await screen.findByRole("rowheader", { name: "Plywood" })).toBeVisible();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      unsubscribe();
    }
  });

  it("keeps unequal project prices isolated and resets editor/search when switching projects", async () => {
    const secondItem = { ...item, id: "item-two", projectId: "project-two", pricePaise: 76543, estimateSource: storedSourceFor("project-two") };
    server.use(http.get("/api/v1/procurement/projects/project-two/items", () => page([secondItem])));
    const view = start();
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.type(screen.getByRole("searchbox"), "Greenply");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await edit();
    await user.type(screen.getByRole("textbox", { name: "Brand" }), " unsaved");
    view.showProject("project-two", "Harbour House");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.queryByText("₹120.05")).not.toBeInTheDocument();
    expect(await screen.findByText("₹765.43")).toBeVisible();
    view.showProject("project-one", "Aurora Villa");
    expect(await screen.findByText("₹120.05")).toBeVisible();
    expect(screen.queryByText("₹765.43")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(view.queryClient.getQueryData(projectProcurementKeys.list("project-two", "", 0, sourceFor("project-two")))).toEqual(expect.objectContaining({ items: [secondItem] }));
  });

  it("rejects a mismatched project DTO instead of showing another project's rows", async () => {
    server.use(http.get("/api/v1/procurement/projects/project-one/items", () => page([{ ...item, projectId: "project-two" }])));
    start();
    expect(await screen.findByRole("alert")).toHaveTextContent("Procurement items could not be loaded.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Plywood")).not.toBeInTheDocument();
  });

  it("uses a read-only active-vendor dropdown for Add item and retains the item draft", async () => {
    permissions.push("procurement.vendor_directory.read");
    const active: ProcurementVendorOption = { id: "vendor-one", code: "PV-1", name: "Shared Timber", status: "active" };
    const inactive: ProcurementVendorOption = { id: "vendor-two", code: "PV-2", name: "Old Timber", status: "inactive" };
    const requests: URL[] = [];
    const itemPosts = vi.fn();
    const vendorPosts = vi.fn();
    server.use(
      http.get("/api/v1/procurement/vendors", ({ request }) => { requests.push(new URL(request.url)); return HttpResponse.json({ data: { items: [active, inactive], total: 2, limit: 20, offset: 0 } }); }),
      http.post("/api/v1/procurement/vendors", vendorPosts),
      http.post("/api/v1/procurement/projects/project-one/items", async ({ request }) => { itemPosts(await request.json()); return HttpResponse.json({ data: { ...item, vendor: active } }, { status: 201 }); })
    );
    start(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add item" }));
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Plywood board");
    const select = screen.getByRole("combobox", { name: "Vendor" });
    expect(select).toHaveProperty("tagName", "SELECT");
    expect(await screen.findByRole("option", { name: "Shared Timber" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Old Timber" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add vendor" })).not.toBeInTheDocument();
    const directoryLink = screen.getByRole("link", { name: "Manage vendors (opens in new tab)" });
    expect(directoryLink).toHaveAttribute("href", "/procurement/vendors");
    expect(directoryLink).toHaveAttribute("target", "_blank");
    expect(directoryLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(requests[0].searchParams.get("effectiveStatus")).toBe("active");
    await user.click(directoryLink);
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Plywood board");
    await user.selectOptions(select, active.id);
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("Plywood board");
    await user.type(screen.getByRole("textbox", { name: "Brand" }), "Greenply");
    await user.selectOptions(screen.getByRole("combobox", { name: "UOM" }), uom.id);
    await user.type(screen.getByRole("textbox", { name: "Price (INR)" }), "88.01");
    await user.type(screen.getByRole("textbox", { name: /Planned order quantity/ }), "1");
    await user.click(screen.getByRole("button", { name: "Use planned amount with GST for allocated work" }));
    expect(screen.getByRole("textbox", { name: "Allocated work (INR)" })).toHaveValue("103.85");
    await user.clear(screen.getByRole("textbox", { name: "Allocated work (INR)" }));
    await user.type(screen.getByRole("textbox", { name: "Allocated work (INR)" }), "30000");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(itemPosts).toHaveBeenCalledWith({ itemName: "Plywood board", brand: "Greenply", uomId: uom.id, vendorId: active.id, pricePaise: 8801, plannedOrderQuantityMilliUnits: 1000, allocatedWorkPaise: 3000000, ...sourceFor() }));
    expect(vendorPosts).not.toHaveBeenCalled();
  });

  it("preserves an unknown legacy amount on price-only edits and displays cap errors without losing input", async () => {
    const vendor = { id: "vendor-existing", name: "Existing Vendor", code: "EX", status: "active" as const };
    const writes: Record<string, unknown>[] = [];
    server.use(http.get("/api/v1/procurement/projects/project-one/items", () => page([{ ...item, vendor }])),
      http.patch("/api/v1/procurement/projects/project-one/items/:id", async ({ request }) => {
        const body = await request.json() as Record<string, unknown>; writes.push(body);
        if ("allocatedWorkPaise" in body) return HttpResponse.json({ error: { code: "PROCUREMENT_VENDOR_ALLOCATION_BASELINE_INCOMPLETE", message: "Historical allocation baseline is incomplete. Ask Super Admin to record missing amounts.", fields: { allocatedWorkPaise: "Historical allocation baseline is incomplete." } } }, { status: 409 });
        return HttpResponse.json({ data: { ...item, vendor } });
      }));
    start(); const user = await edit();
    expect(screen.getByRole("textbox", { name: "Allocated work (INR)" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveLength(1)); expect(writes[0]).not.toHaveProperty("allocatedWorkPaise");
    await user.click(await screen.findByRole("button", { name: "Edit Plywood, Greenply" }));
    await user.type(screen.getByRole("textbox", { name: "Allocated work (INR)" }), "50000.01");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText(/Ask Super Admin/); expect(screen.getByRole("textbox", { name: "Allocated work (INR)" })).toHaveValue("50000.01");
    expect(writes[1]).toMatchObject({ allocatedWorkPaise: 5000001, pricePaise: 12005 });
  });

  it("does not allow free text or quick-add from the item editor", async () => {
    const post = vi.fn();
    server.use(http.patch("/api/v1/procurement/projects/project-one/items/:id", async ({ request }) => { post(await request.json()); return HttpResponse.json({ data: item }); }));
    start();
    const user = await edit();
    const select = screen.getByRole("combobox", { name: "Vendor" });
    expect(select).toHaveProperty("tagName", "SELECT");
    expect(screen.queryByRole("textbox", { name: "New vendor name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add vendor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Manage vendors/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ vendorId: null })));
  });

  it("loads later active-vendor pages and selects a vendor", async () => {
    const vendors = Array.from({ length: 21 }, (_, i): ProcurementVendorOption => ({ id: `vendor-${i}`, code: `V${i}`, name: `Vendor ${String(i).padStart(2, "0")}`, status: "active" }));
    const requests: URL[] = [];
    server.use(http.get("/api/v1/procurement/vendors", ({ request }) => {
      const url = new URL(request.url); requests.push(url);
      const offset = Number(url.searchParams.get("offset"));
      return HttpResponse.json({ data: { items: vendors.slice(offset, offset + 20), total: vendors.length, limit: 20, offset } });
    }));
    start();
    const user = await edit();
    const select = screen.getByRole("combobox", { name: "Vendor" });
    expect(await screen.findByRole("option", { name: "Vendor 00" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Vendor 20" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more vendors" }));
    expect(await screen.findByRole("option", { name: "Vendor 20" })).toBeVisible();
    expect(requests.some((request) => request.searchParams.get("offset") === "20")).toBe(true);
    expect(requests.every((request) => request.searchParams.get("effectiveStatus") === "active")).toBe(true);
    await user.selectOptions(select, "vendor-20");
    expect(select).toHaveValue("vendor-20");
  });

  it("shows the saved active vendor beyond the first page without duplicating it after load more", async () => {
    const vendors = Array.from({ length: 21 }, (_, i): ProcurementVendorOption => ({ id: `vendor-${i}`, code: `V${i}`, name: `Vendor ${String(i).padStart(2, "0")}`, status: "active" }));
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items", () => page([{ ...item, vendor: vendors[20] }])),
      http.get("/api/v1/procurement/vendors", ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get("offset"));
        return HttpResponse.json({ data: { items: vendors.slice(offset, offset + 20), total: vendors.length, limit: 20, offset } });
      })
    );
    start(); const user = await edit();
    const select = screen.getByRole("combobox", { name: "Vendor" });
    expect(select).toHaveValue("vendor-20");
    expect(screen.getByRole("option", { name: "Current vendor: Vendor 20 (retained)" })).toBeDisabled();
    expect(screen.queryByText(/Current vendor: Vendor 20 \(active\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more vendors" }));
    await waitFor(() => expect(screen.getAllByRole("option", { name: "Vendor 20" })).toHaveLength(1));
    expect(screen.queryByRole("option", { name: "Current vendor: Vendor 20 (retained)" })).not.toBeInTheDocument();
    expect(select).toHaveValue("vendor-20");
  });

  it("retains an inactive historical vendor on unrelated edits, then allows explicit clear", async () => {
    const oldVendor = { id: "old-vendor", code: "OLD", name: "Old Timber", status: "inactive" as const };
    const writes = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items", () => page([{ ...item, vendor: oldVendor }])),
      http.patch("/api/v1/procurement/projects/project-one/items/:id", async ({ request }) => { writes(await request.json()); return HttpResponse.json({ data: { ...item, vendor: oldVendor } }); })
    );
    start();
    const user = await edit();
    expect(screen.getByText(/Current vendor: Old Timber \(inactive\)/)).toBeVisible();
    expect(screen.queryByRole("option", { name: "Old Timber" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Keep current vendor: Old Timber/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveBeenCalledWith(expect.objectContaining({ vendorId: "old-vendor" })));
    await edit();
    await user.click(screen.getByRole("button", { name: "Clear vendor" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveBeenCalledWith(expect.objectContaining({ vendorId: null })));
  });

  it("refreshes an open item editor when the active-vendor dropdown receives focus", async () => {
    const activated: ProcurementVendorOption = { id: "vendor-now-active", code: "VNA", name: "Newly Active", status: "active" };
    let activeVendors: ProcurementVendorOption[] = [];
    const requests = vi.fn();
    server.use(http.get("/api/v1/procurement/vendors", ({ request }) => {
      requests(new URL(request.url));
      return HttpResponse.json({ data: { items: activeVendors, total: activeVendors.length, limit: 20, offset: 0 } });
    }));
    start();
    await edit();
    expect(await screen.findByText(/No active vendors are available/)).toBeVisible();
    activeVendors = [activated];
    const select = screen.getByRole("combobox", { name: "Vendor" });
    select.focus();
    expect(await screen.findByRole("option", { name: "Newly Active" })).toBeInTheDocument();
    expect(requests).toHaveBeenCalledTimes(2);
  });
});
