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

const uom = { id: "uom-one", code: "sq ft", name: "Square feet" };
const sourceFor = (projectId = "project-one") => ({ estimateId: projectId === "project-one" ? "estimate-one" : "estimate-two", estimateVersion: 3, sourceLineItemKey: "line-one" });
const storedSourceFor = (projectId = "project-one") => ({ ...sourceFor(projectId), estimateReviewRoundId: "round-one", sourceSectionId: "CA" });
const item: ProjectProcurementItem = {
  id: "item-one", projectId: "project-one", vendor: null, itemName: "Plywood", brand: "Greenply", uom: { ...uom, status: "active" },
  pricePaise: 12005, estimateSource: storedSourceFor(), version: 3, createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z"
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
        const saved = { ...item, itemName: String(body.itemName), brand: String(body.brand), pricePaise: Number(body.pricePaise) };
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
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" }));
    await screen.findByText("Plywood board added in this project.");
    expect(post).toHaveBeenCalledWith({ itemName: "Plywood board", brand: "Greenply", uomId: uom.id, vendorId: null, pricePaise: 12005, ...sourceFor() });
    expect(screen.getByRole("rowheader", { name: "Plywood board" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add item" })).toHaveFocus();
    view.unmount();
    start();
    expect(await screen.findByRole("rowheader", { name: "Plywood board" })).toBeVisible();
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
      { itemName: "Plywood", brand: "Greenply", uomId: uom.id, vendorId: null, pricePaise: 14501, expectedVersion: 3, ...sourceFor() },
      { itemName: "Renamed panel", brand: "Greenply", uomId: uom.id, vendorId: null, pricePaise: 18999, expectedVersion: 4, ...sourceFor() }
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

  it("saves a vendor independently, preserves the item draft and reuses that vendor in another project", async () => {
    let vendors: ProcurementVendorOption[] = [];
    const savedVendor: ProcurementVendorOption = { id: "vendor-one", code: "PV-1", name: "Shared Timber", status: "active" };
    const vendorPosts = vi.fn();
    const itemPosts = vi.fn();
    let finishVendor!: () => void;
    const vendorResponse = new Promise<void>((resolve) => { finishVendor = resolve; });
    server.use(
      http.get("/api/v1/procurement/vendors", () => HttpResponse.json({ data: { items: vendors, total: vendors.length, limit: 20, offset: 0 } })),
      http.post("/api/v1/procurement/vendors", async ({ request }) => {
        vendorPosts(await request.json());
        await vendorResponse;
        vendors = [savedVendor];
        return HttpResponse.json({ data: savedVendor }, { status: 201 });
      }),
      http.get("/api/v1/procurement/projects/project-two/items", () => page([])),
      http.post("/api/v1/procurement/projects/project-two/items", async ({ request }) => {
        itemPosts(await request.json());
        return HttpResponse.json({ data: { ...item, id: "second-item", projectId: "project-two", vendor: savedVendor, estimateSource: storedSourceFor("project-two") } }, { status: 201 });
      })
    );
    const view = start();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "My unsaved item");
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    await user.type(screen.getByRole("textbox", { name: "New vendor name" }), " Shared   Timber ");
    expect(screen.getByText(/even if you cancel this item/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Add item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finishVendor();
    expect(await screen.findByText("Shared Timber is selected and saved for future projects.")).toBeVisible();
    expect(vendorPosts).toHaveBeenCalledWith({ name: "Shared Timber" });
    expect(screen.getByRole("textbox", { name: "Item name" })).toHaveValue("My unsaved item");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    view.showProject("project-two", "Harbour House");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const panel = screen.getByRole("dialog");
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Plywood");
    await user.type(screen.getByRole("textbox", { name: "Brand" }), "Greenply");
    await user.click(screen.getByRole("combobox", { name: "Vendor" }));
    await user.click(await screen.findByRole("option", { name: "Shared Timber" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "UOM" }), uom.id);
    await user.type(screen.getByRole("textbox", { name: "Price (INR)" }), "88.01");
    await user.type(screen.getByRole("textbox", { name: "Allocated work (INR)" }), "30000");
    await user.click(within(panel).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(itemPosts).toHaveBeenCalledWith({ itemName: "Plywood", brand: "Greenply", uomId: uom.id, vendorId: savedVendor.id, pricePaise: 8801, allocatedWorkPaise: 3000000, ...sourceFor("project-two") }));
    expect(view.queryClient.getQueryState(projectProcurementKeys.list("project-one", "", 0, sourceFor()))?.isInvalidated).toBe(false);
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

  it("requires typed vendor text to be selected, saved or cleared and protects unsaved quick-add input", async () => {
    const post = vi.fn();
    server.use(http.patch("/api/v1/procurement/projects/project-one/items/:id", post));
    start();
    const user = await edit();
    await user.type(screen.getByRole("combobox", { name: "Vendor" }), "Unknown vendor");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Select a saved vendor, save the new vendor, or clear the vendor entry.")).toBeVisible();
    expect(post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Clear vendor" }));
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    await user.type(screen.getByRole("textbox", { name: "New vendor name" }), "Unsaved name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "New vendor name" })).toHaveValue("Unsaved name");
  });

  it("loads subsequent vendor pages and debounces searchable options with keyboard selection", async () => {
    const vendors = Array.from({ length: 21 }, (_, i): ProcurementVendorOption => ({ id: `vendor-${i}`, code: `V${i}`, name: `Vendor ${String(i).padStart(2, "0")}`, status: "active" }));
    const requests: URL[] = [];
    server.use(http.get("/api/v1/procurement/vendors", ({ request }) => {
      const url = new URL(request.url); requests.push(url);
      const offset = Number(url.searchParams.get("offset"));
      const q = url.searchParams.get("q") ?? "";
      const filtered = vendors.filter((vendor) => vendor.name.toLowerCase().includes(q.toLowerCase()));
      return HttpResponse.json({ data: { items: filtered.slice(offset, offset + 20), total: filtered.length, limit: 20, offset } });
    }));
    start();
    const user = await edit();
    await user.click(screen.getByRole("combobox", { name: "Vendor" }));
    expect(await screen.findByRole("option", { name: "Vendor 00" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Vendor 20" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more vendors" }));
    await user.click(screen.getByRole("combobox", { name: "Vendor" }));
    expect(await screen.findByRole("option", { name: "Vendor 20" })).toBeVisible();
    expect(requests.some((request) => request.searchParams.get("offset") === "20")).toBe(true);
    const before = requests.length;
    await user.type(screen.getByRole("combobox", { name: "Vendor" }), "Vendor 20");
    expect(requests).toHaveLength(before);
    await waitFor(() => expect(requests).toHaveLength(before + 1));
    expect(requests.at(-1)!.searchParams.get("q")).toBe("Vendor 20");
    await screen.findByRole("option", { name: "Vendor 20" });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveValue("Vendor 20");
    expect(screen.queryByRole("listbox", { name: "Vendor options" })).not.toBeInTheDocument();
  });

  it("keeps vendor creation errors actionable and retains historical vendors while allowing clear", async () => {
    const oldVendor = { id: "old-vendor", code: "OLD", name: "Old Timber", status: "inactive" as const };
    const writes = vi.fn();
    server.use(
      http.get("/api/v1/procurement/projects/project-one/items", () => page([{ ...item, vendor: oldVendor }])),
      http.patch("/api/v1/procurement/projects/project-one/items/:id", async ({ request }) => { writes(await request.json()); return HttpResponse.json({ data: { ...item, vendor: oldVendor } }); }),
      http.post("/api/v1/procurement/vendors", () => HttpResponse.json({ error: { code: "PROCUREMENT_VENDOR_INACTIVE", message: "This vendor is inactive. Ask an administrator to activate it." } }, { status: 409 }))
    );
    start();
    const user = await edit();
    expect(screen.getByText(/current vendor is inactive/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveBeenCalledWith(expect.objectContaining({ vendorId: "old-vendor" })));
    await edit();
    await user.click(screen.getByRole("button", { name: "Clear vendor" }));
    await user.click(screen.getByRole("button", { name: "Add vendor" }));
    await user.type(screen.getByRole("textbox", { name: "New vendor name" }), "Old Timber");
    await user.click(screen.getByRole("button", { name: "Save vendor" }));
    expect(await screen.findByText("This vendor is inactive. Ask an administrator to activate it.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "New vendor name" })).toHaveValue("Old Timber");
    await user.click(screen.getByRole("button", { name: "Cancel vendor" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveBeenCalledWith(expect.objectContaining({ vendorId: null })));
  });

  it("cannot select an earlier unfiltered vendor with immediate keyboard input during debounce", async () => {
    const electrical: ProcurementVendorOption = { id: "vendor-electrical", code: "EL", name: "Electrical Supply", status: "active" };
    const orion: ProcurementVendorOption = { id: "vendor-orion", code: "OR", name: "Orion Supply", status: "active" };
    const writes = vi.fn();
    server.use(
      http.get("/api/v1/procurement/vendors", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "";
        const items = [electrical, orion].filter((vendor) => vendor.name.toLowerCase().includes(q.toLowerCase()));
        return HttpResponse.json({ data: { items, total: items.length, limit: 20, offset: 0 } });
      }),
      http.patch("/api/v1/procurement/projects/project-one/items/:id", async ({ request }) => {
        writes(await request.json());
        return HttpResponse.json({ data: { ...item, vendor: orion } });
      })
    );
    start();
    const user = await edit();
    const input = screen.getByRole("combobox", { name: "Vendor" });
    await user.click(input);
    expect(await screen.findByRole("option", { name: "Electrical Supply" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Orion Supply" })).toBeVisible();
    await user.type(input, "Orion");
    expect(screen.queryByRole("listbox", { name: "Vendor options" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Orion");
    expect(writes).not.toHaveBeenCalled();
    expect(await screen.findByRole("option", { name: "Orion Supply" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Electrical Supply" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Orion Supply");
    await user.type(screen.getByRole("textbox", { name: "Allocated work (INR)" }), "100");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes).toHaveBeenCalledWith(expect.objectContaining({ vendorId: orion.id, allocatedWorkPaise: 10000 })));
  });

  it("keeps a late response for an old vendor query unselectable after the search changes", async () => {
    const orion: ProcurementVendorOption = { id: "vendor-orion", code: "OR", name: "Orion Supply", status: "active" };
    const oak: ProcurementVendorOption = { id: "vendor-oak", code: "OK", name: "Oak Supply", status: "active" };
    let finishOldQuery!: () => void;
    const oldResponse = new Promise<void>((resolve) => { finishOldQuery = resolve; });
    const oldStarted = vi.fn();
    server.use(http.get("/api/v1/procurement/vendors", async ({ request }) => {
      const q = new URL(request.url).searchParams.get("q");
      if (q === "Orion") { oldStarted(); await oldResponse; }
      const items = q === "Orion" ? [orion] : q === "Oak" ? [oak] : [orion, oak];
      return HttpResponse.json({ data: { items, total: items.length, limit: 20, offset: 0 } });
    }));
    start();
    const user = await edit();
    const input = screen.getByRole("combobox", { name: "Vendor" });
    await user.type(input, "Orion");
    await waitFor(() => expect(oldStarted).toHaveBeenCalled());
    await user.clear(input);
    await user.type(input, "Oak");
    finishOldQuery();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Oak");
    expect(screen.queryByRole("option", { name: "Orion Supply" })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Oak Supply" })).toBeVisible();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Oak Supply");
  });
});
