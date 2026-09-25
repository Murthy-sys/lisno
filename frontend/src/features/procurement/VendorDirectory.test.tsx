import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionCode } from "../../api/authorization-contract";
import { authorizationFor } from "../../test/authFixtures";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { knowledgeQueryKeys } from "../ai-estimator-knowledge/knowledgeQueryKeys";
import type { KnowledgeMaster } from "../ai-estimator-knowledge/knowledgeTypes";
import { ProcurementManagementPage } from "./ProcurementManagementPage";
import { completeVendor, vendorBasket, vendorSubBasket } from "./vendorProfile.fixtures";
import { vendorDirectoryColumns, type VendorDirectoryColumn } from "./vendorDirectoryColumns";
import { vendorColumnWidth, VendorDirectoryTable } from "./VendorDirectoryTable";

let permissions: readonly PermissionCode[] | undefined;
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "sa", name: "Super Admin", role: "super_admin" }, authorization: authorizationFor("super_admin", permissions) }) }));
const endpoint = "/api/v1/admin/ai-estimator-knowledge/vendors";
const data = (value: unknown) => HttpResponse.json({ data: value });
const error = (status = 503) => HttpResponse.json({ error: { code: status === 403 ? "FORBIDDEN" : "TEMPORARY", message: status === 403 ? "Access changed" : "Try again" } }, { status });
let rows: KnowledgeMaster[];
let requests: URLSearchParams[];
let overviewMissing: boolean;
let overviewFailed: boolean;
let listFailed: boolean;
function start() {
  let client!: QueryClient;
  function Capture() { client = useQueryClient(); return <ProcurementManagementPage />; }
  return { ...renderWithQuery(<Capture />), client };
}
const pageRequests = () => requests.filter((params) => !params.has("includeDirectoryOverview"));
beforeEach(() => {
  permissions = undefined; requests = []; overviewMissing = false; overviewFailed = false; listFailed = false;
  const { procurementProfile: _profile, geoTaggedPicture: _photo, msmeCertificate: _certificate, ...publicVendor } = completeVendor;
  rows = Array.from({ length: 12 }, (_, index) => ({
    ...publicVendor, id: index ? `vendor-${index + 1}` : completeVendor.id, name: index ? `Vendor ${index + 1}` : completeVendor.name,
    procurementSummary: { ...completeVendor.procurementSummary, executionType: ["labor", "material_labour"] },
  }));
  server.use(
    http.get(endpoint, ({ request }) => {
      const params = new URL(request.url).searchParams; requests.push(params);
      if (params.get("includeDirectoryOverview") === "true") {
        if (overviewFailed) return error();
        return data({ items: rows.slice(0, 1), pagination: { total: rows.length, limit: 1, offset: 0, hasMore: true }, ...(overviewMissing ? {} : { directoryOverview: { totalVendors: rows.length, activeVendors: rows.length - 1, underReviewVendors: 2 } }) });
      }
      if (listFailed) return error();
      const filtered = rows.filter((vendor) => !params.get("search") || vendor.name.toLowerCase().includes(params.get("search")!.toLowerCase()));
      const offset = Number(params.get("offset") ?? 0); const limit = Number(params.get("limit") ?? 5);
      return data({ items: filtered.slice(offset, offset + limit), pagination: { total: filtered.length, offset, limit, hasMore: offset + limit < filtered.length } });
    }),
    http.get(`${endpoint}/vendor-one`, () => data(completeVendor)),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets", () => data({ items: [vendorBasket], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } })),
    http.get("/api/v1/admin/ai-estimator-knowledge/baskets/basket-one/sub-baskets", () => data({ items: [vendorSubBasket], pagination: { total: 1, limit: 100, offset: 0, hasMore: false } }))
  );
});

describe("reference vendor directory", () => {
  it("uses independent global counts, canonical execution labels and unavailable KPI on ten-row pages", async () => {
    start(); const user = userEvent.setup();
    const table = await screen.findByRole("table");
    expect(pageRequests()[0].get("limit")).toBe("10");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(10);
    expect(within(table).getAllByText("Labor · Material + Labour")).toHaveLength(10);
    expect(within(table).getAllByText("Not available")).toHaveLength(10);
    const overview = screen.getByRole("region", { name: "Vendor overview" });
    expect(within(overview).getByText("12")).toBeVisible(); expect(within(overview).getByText("92%")).toBeVisible();
    expect(within(overview).getByText("Not available")).toBeVisible();
    expect(screen.queryByText("Vendor performance")).not.toBeInTheDocument(); expect(screen.queryByText(/performance recommendations/)).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 10 of 12 vendors")).toBeVisible();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("Showing 11 to 12 of 12 vendors")).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByRole("rowheader")).toHaveLength(2);
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Type" }), "supplier");
    await waitFor(() => expect(pageRequests().at(-1)?.get("vendorType")).toBe("supplier"));
    expect(pageRequests().at(-1)?.get("offset")).toBe("0");
    expect(requests.filter((params) => params.has("includeDirectoryOverview"))).toHaveLength(1);
    expect(within(overview).getByText("12")).toBeVisible();
    expect(within(screen.getByRole("table")).queryByText(/\d\.\d/)).not.toBeInTheDocument();
  });

  it("debounces search, submits immediately on Enter, and cancels pending search on Reset and unmount", async () => {
    const view = start(); const user = userEvent.setup(); await screen.findByRole("table");
    const search = screen.getByRole("searchbox", { name: "Search vendors" });
    await user.type(search, "Timber");
    expect(pageRequests()).toHaveLength(1);
    await waitFor(() => expect(pageRequests().at(-1)?.get("search")).toBe("Timber"));
    await user.clear(search); await user.type(search, "Vendor 6{Enter}");
    await waitFor(() => expect(pageRequests().at(-1)?.get("search")).toBe("Vendor 6"));
    await user.clear(search); await user.type(search, "Cancelled");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(search).toHaveValue(""); expect(pageRequests().some((params) => params.get("search") === "Cancelled")).toBe(false);
    await user.type(search, "Unmounted"); view.unmount();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(pageRequests().some((params) => params.get("search") === "Unmounted")).toBe(false);
  });

  it("selects only visible rows, exposes mixed select-all, and clears selection on page/filter/reset", async () => {
    start(); const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: "Select Timber House" }));
    const all = screen.getByRole("checkbox", { name: "Select all vendors on this page" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true); expect(screen.getByText("1 vendor selected on this page")).toBeVisible();
    await user.click(all); expect(screen.getByText("10 vendors selected on this page")).toBeVisible(); expect(all.indeterminate).toBe(false);
    await user.click(screen.getByRole("button", { name: "Clear selection" })); expect(all).not.toBeChecked();
    await user.click(all); await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("checkbox", { name: "Select Vendor 11" })).not.toBeChecked(); expect(screen.queryByText(/selected on this page/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select Vendor 11" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "inactive");
    await screen.findByRole("checkbox", { name: "Select Timber House" }); expect(screen.queryByText(/selected on this page/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select Timber House" })); await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByText(/selected on this page/)).not.toBeInTheDocument();
  });

  it("operates the overflow menu by keyboard, restores focus, and opens details read-only", async () => {
    start(); const user = userEvent.setup(); const trigger = await screen.findByRole("button", { name: "More actions for Timber House" });
    trigger.focus(); await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "View details" })).toHaveFocus();
    await user.keyboard("{Escape}"); expect(trigger).toHaveFocus(); expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.keyboard("{Enter}{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Vendor details" });
    expect(await within(dialog).findByRole("textbox", { name: "Entity Name" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("recovers the final page after archive and refreshes global overview with reason/CAS", async () => {
    const writes: unknown[] = [];
    rows = rows.slice(0, 11);
    server.use(http.delete(`${endpoint}/vendor-11`, async ({ request }) => {
      writes.push(await request.json()); const archived = rows.at(-1)!; rows = rows.slice(0, -1); return data({ ...archived, status: "archived", version: 2 });
    }));
    start(); const user = userEvent.setup(); await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await user.click(await screen.findByRole("button", { name: "Archive Vendor 11" }));
    const dialog = screen.getByRole("alertdialog"); await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "No longer available");
    await user.click(within(dialog).getByRole("button", { name: "Archive vendor" }));
    await screen.findByText("Vendor 11 archived.");
    expect(await screen.findByText("Showing 1 to 10 of 10 vendors")).toBeVisible();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(writes).toEqual([{ expectedVersion: 1, reason: "No longer available" }]);
    expect(requests.filter((params) => params.has("includeDirectoryOverview"))).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Vendor overview" })).getByText("90%")).toBeVisible();
  });

  it.each(["missing", "failed"])("keeps %s overview unavailable and independently retryable", async (state) => {
    overviewMissing = state === "missing"; overviewFailed = state === "failed";
    start(); const user = userEvent.setup(); await screen.findByRole("table");
    const overview = screen.getByRole("region", { name: "Vendor overview" });
    await within(overview).findByText("Vendor overview is unavailable.");
    expect(within(overview).getAllByText("Not available")).toHaveLength(4); expect(within(overview).queryByText("0")).not.toBeInTheDocument();
    overviewMissing = false; overviewFailed = false; await user.click(within(overview).getByRole("button", { name: "Retry overview" }));
    expect(await within(overview).findByText("12")).toBeVisible();
  });

  it("preserves lifecycle separately from review and distinguishes incomplete legacy profiles", async () => {
    rows = [{ ...rows[0], procurementSummary: undefined }, { ...rows[1], status: "inactive" }, { ...rows[2], status: "archived" }];
    start(); const table = await screen.findByRole("table");
    const legacy = within(table).getByRole("rowheader", { name: /Timber House/ }).closest("tr")!;
    expect(within(legacy).getByText("Incomplete")).toBeVisible(); expect(within(legacy).getByText("Active")).toBeVisible(); expect(within(legacy).getByText("Under Review")).toBeVisible();
    const inactive = within(table).getByRole("rowheader", { name: /Vendor 2/ }).closest("tr")!;
    expect(within(inactive).getByText("Inactive")).toBeVisible(); expect(within(inactive).getByText("Under Review")).toBeVisible();
    const archived = within(table).getByRole("rowheader", { name: /Vendor 3/ }).closest("tr")!;
    expect(within(archived).getByText("Archived")).toBeVisible(); expect(within(archived).queryByText("Under Review")).not.toBeInTheDocument();
  });

  it("changes rows per page, returns to the first page, clears selection and survives Reset", async () => {
    start(); const user = userEvent.setup(); await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("Showing 11 to 12 of 12 vendors")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Select Vendor 11" })); expect(screen.getByText("1 vendor selected on this page")).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "25");
    await waitFor(() => expect(pageRequests().at(-1)?.get("limit")).toBe("25")); expect(pageRequests().at(-1)?.get("offset")).toBe("0");
    expect(await screen.findByText("Showing 1 to 12 of 12 vendors")).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByRole("rowheader")).toHaveLength(12);
    expect(screen.queryByText(/selected on this page/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page"); expect(screen.queryByRole("button", { name: "Page 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select Timber House" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "10");
    expect(await screen.findByText("Showing 1 to 10 of 12 vendors")).toBeVisible(); expect(screen.getByRole("checkbox", { name: "Select Timber House" })).not.toBeChecked();
    expect(screen.queryByText(/selected on this page/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "25");
    await user.selectOptions(screen.getByRole("combobox", { name: "Vendor Type" }), "supplier");
    await waitFor(() => expect(pageRequests().at(-1)?.get("vendorType")).toBe("supplier"));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(pageRequests().at(-1)?.has("vendorType")).toBe(false)); expect(pageRequests().at(-1)?.get("limit")).toBe("25");
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toHaveValue("25");
  });

  it("shows one Basket column with explicit main and sub levels and unavailable states", async () => {
    rows = [
      rows[0],
      { ...rows[1], procurementSummary: { ...rows[1].procurementSummary!, mainBasket: { id: "basket-old", name: "Old Basket", status: "inactive" }, subBasket: null } },
      { ...rows[2], procurementSummary: { ...rows[2].procurementSummary!, mainBasket: { id: "basket-gone", name: null, status: "unavailable" }, subBasket: { id: "sub-gone", name: null } } },
      { ...rows[3], procurementSummary: undefined },
    ];
    start(); const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["", "Vendor Details", "Type", "Basket", "Status", "Vendor KPI", "Actions"]);
    const basket = (name: RegExp) => within(table).getByRole("rowheader", { name }).closest("tr")!.querySelector<HTMLElement>('[data-column="basket"]')!;
    expect(basket(/Timber House/)).toHaveTextContent(/Main Basket: Carpentry/); expect(basket(/Timber House/)).toHaveTextContent(/Sub Basket: Cabinet work/);
    expect(basket(/Timber House/)).toHaveAttribute("data-label", "Basket");
    expect(basket(/Vendor 2/)).toHaveTextContent(/Main Basket: Old Basket/); expect(within(basket(/Vendor 2/)).getByText("Unavailable for new selections")).toBeVisible(); expect(basket(/Vendor 2/)).toHaveTextContent(/Sub Basket: Not recorded/);
    expect(basket(/Vendor 3/)).toHaveTextContent(/Main Basket: Unavailable/); expect(basket(/Vendor 3/)).toHaveTextContent(/Sub Basket: Unavailable/);
    expect(basket(/Vendor 4/)).toHaveTextContent(/Main Basket: Not recorded/); expect(basket(/Vendor 4/)).toHaveTextContent(/Sub Basket: Not recorded/);
  });

  it("renders additional registry columns in headers, cells and card labels without other changes", () => {
    const extra = (id: string, header: string): VendorDirectoryColumn => ({ id, header, width: { weight: 20, min: 140 }, placement: "field", render: (vendor) => `${header} for ${vendor.name}` });
    const columns = [...vendorDirectoryColumns.slice(0, -1), extra("city", "City"), extra("gst", "GST"), vendorDirectoryColumns.at(-1)!];
    render(<VendorDirectoryTable items={rows.slice(0, 2)} selected={new Set()} onSelection={vi.fn()} canUpdate canArchive onEdit={vi.fn()} onView={vi.fn()} onArchive={vi.fn()} columns={columns} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["", "Vendor Details", "Type", "Basket", "Status", "Vendor KPI", "City", "GST", "Actions"]);
    expect(table.querySelectorAll("col")).toHaveLength(9);
    expect(table.style.getPropertyValue("--vendor-table-min-width")).toBe("1220px");
    expect(table.querySelector('col[data-column="vendor"]')).not.toHaveAttribute("style");
    for (const vendor of rows.slice(0, 2)) {
      const row = within(table).getByRole("rowheader", { name: new RegExp(vendor.name) }).closest("tr")!;
      expect(within(row).getByText(`City for ${vendor.name}`).closest("td")).toHaveAttribute("data-label", "City");
      expect(within(row).getByText(`GST for ${vendor.name}`).closest("td")).toHaveAttribute("data-label", "GST");
      expect(within(row).getByRole("button", { name: `Edit ${vendor.name}` })).toBeVisible();
    }
  });

  it("renders fixed, fluid, capped and fill column widths through one helper", () => {
    const column = (width: VendorDirectoryColumn["width"]): VendorDirectoryColumn => ({ id: "probe", header: "Probe", width, placement: "field", render: () => null });
    expect(vendorColumnWidth(column({ fixed: 48 }), 940, 100)).toBe("48px");
    expect(vendorColumnWidth(column({ weight: 20, min: 140 }), 940, 100)).toBe("max(140px, calc(140px + (100cqw - 942px) * 0.2))");
    expect(vendorColumnWidth(column({ weight: 30, min: 150, max: 240 }), 940, 100)).toBe("clamp(150px, calc(150px + (100cqw - 942px) * 0.3), 240px)");
    expect(vendorColumnWidth(column({ fill: true, weight: 45, min: 220 }), 940, 100)).toBeUndefined();
  });

  it("keeps Vendor Details as the only fill column, caps Type and Basket, and a 940px minimum table width", () => {
    const width = (id: string) => vendorDirectoryColumns.find((column) => column.id === id)!.width;
    expect(vendorDirectoryColumns.filter((column) => "fill" in column.width).map((column) => column.id)).toEqual(["vendor"]);
    expect(width("vendor")).toEqual({ fill: true, weight: 45, min: 220 });
    expect(width("type")).toEqual({ weight: 30, min: 150, max: 240 }); expect(width("basket")).toEqual({ weight: 25, min: 130, max: 220 });
    render(<VendorDirectoryTable items={rows.slice(0, 2)} selected={new Set()} onSelection={vi.fn()} canUpdate canArchive onEdit={vi.fn()} onView={vi.fn()} onArchive={vi.fn()} />);
    const table = screen.getByRole("table");
    expect(table.style.getPropertyValue("--vendor-table-min-width")).toBe("940px");
    expect(table.querySelector('col[data-column="vendor"]')).not.toHaveAttribute("style");
  });

  it("makes the table wrapper a named keyboard region only while it overflows", () => {
    const original = globalThis.ResizeObserver; let resize!: ResizeObserverCallback; let scrollWidth = 900;
    globalThis.ResizeObserver = class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const spies = [vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(() => scrollWidth), vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(1000)];
    try {
      render(<VendorDirectoryTable items={rows.slice(0, 2)} selected={new Set()} onSelection={vi.fn()} canUpdate canArchive onEdit={vi.fn()} onView={vi.fn()} onArchive={vi.fn()} />);
      const wrapper = screen.getByRole("table").parentElement!;
      expect(screen.queryByRole("region", { name: "Vendor table, scroll horizontally" })).not.toBeInTheDocument(); expect(wrapper).not.toHaveAttribute("tabindex");
      scrollWidth = 1300; act(() => resize([], {} as ResizeObserver));
      const region = screen.getByRole("region", { name: "Vendor table, scroll horizontally" });
      expect(region).toBe(wrapper); expect(region).toHaveAttribute("tabindex", "0"); expect(region).toHaveAttribute("data-scrollable", "true");
      scrollWidth = 900; act(() => resize([], {} as ResizeObserver));
      expect(screen.queryByRole("region", { name: "Vendor table, scroll horizontally" })).not.toBeInTheDocument(); expect(wrapper).not.toHaveAttribute("tabindex"); expect(wrapper).not.toHaveAttribute("data-scrollable");
    } finally { globalThis.ResizeObserver = original; spies.forEach((spy) => spy.mockRestore()); }
  });

  it("shows list retry and removes stale directory/editor content on permission loss", async () => {
    listFailed = true; const view = start(); const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Retry vendors" }));
    listFailed = false; await user.click(await screen.findByRole("button", { name: "Retry vendors" }));
    await user.click(await screen.findByRole("button", { name: "Edit Timber House" })); await screen.findByRole("textbox", { name: "Entity Name" });
    server.use(http.get(endpoint, () => error(403)));
    await act(async () => { await view.client.invalidateQueries({ queryKey: knowledgeQueryKeys.masterLists("vendors") }); });
    expect(await screen.findByText("You do not have permission to configure vendors.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
