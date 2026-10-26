import axe from "axe-core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeModeSurfacePanel } from "./KnowledgeModeSurfacePanel";
import type { KnowledgeMaster, KnowledgeSurface } from "./knowledgeTypes";

const timestamp = "2026-09-03T08:00:00.000Z";
const wallSurface = surface("surface-wall", "Wall surface");
const floorSurface = surface("surface-floor", "Floor surface");

/* The panel always ships inside the Mode page's labelled <section>, so the
   accessibility pass renders it in that landmark rather than bare in the body. */
function renderPanel(
  overrides: Partial<React.ComponentProps<typeof KnowledgeModeSurfacePanel>> = {},
  { inLandmark = false } = {}
) {
  const props: React.ComponentProps<typeof KnowledgeModeSurfacePanel> = {
    selectedIds: [wallSurface.id],
    surfaces: [wallSurface, floorSurface],
    catalogState: { status: "ready" },
    sectionState: { status: "ready" },
    readOnly: false,
    saving: false,
    dirty: false,
    canQuickAdd: true,
    onChange: vi.fn(),
    onQuickAdd: vi.fn(),
    ...overrides
  };
  const element = <KnowledgeModeSurfacePanel {...props} />;
  return {
    ...render(inLandmark
      ? <section aria-label="Surfaces">{element}</section>
      : element),
    props
  };
}

describe("KnowledgeModeSurfacePanel", () => {
  it("keeps Configuration artwork decorative and surface selection keyboard-operable", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ presentation: "configuration" }, { inLandmark: true });
    expect(screen.getByRole("rowheader", { name: "Wall surface" })).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    const selector = screen.getByRole("button", { name: "Applicable surfaces" });
    selector.focus();
    await user.keyboard("{Enter}");
    const search = screen.getByRole("searchbox", { name: "Search surfaces" });
    expect(search).toHaveFocus();
    await user.type(search, "Floor");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(props.onChange).toHaveBeenCalledExactlyOnceWith([floorSurface.id, wallSurface.id]);
    await user.keyboard("{Escape}");
    expect(selector).toHaveFocus();
    expect(selector).toHaveAttribute("aria-expanded", "false");

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("locks Configuration creation, editing and detachment while saving", async () => {
    const user = userEvent.setup();
    const onEditSurface = vi.fn();
    const { props } = renderPanel({ presentation: "configuration", saving: true, onEditSurface });
    for (const name of ["Applicable surfaces", "Add Surface", "Create Surface", "Edit reusable surface Wall surface", "Remove Wall surface from Main Line"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      await user.click(button);
    }
    expect(props.onChange).not.toHaveBeenCalled();
    expect(props.onQuickAdd).not.toHaveBeenCalled();
    expect(onEditSurface).not.toHaveBeenCalled();
  });

  it("labels proposed surface rows and permits line unselection without routing them to shared editing", async () => {
    const user = userEvent.setup();
    const proposed = { id: "proposal-surface", name: "Acoustic panel", description: "Timber backing" };
    const onEditSurface = vi.fn();
    const { props } = renderPanel({
      presentation: "overview", proposalActions: true, proposedSurfaces: [proposed],
      selectedIds: [wallSurface.id, proposed.id], onEditSurface
    });

    const table = screen.getByRole("table", { name: "Selected surface details" });
    expect(within(table).getByRole("rowheader", { name: "Acoustic panel Proposed" })).toBeVisible();
    expect(within(table).getByText("Timber backing")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit reusable surface Acoustic panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit reusable surface Wall surface" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Add Surface" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Create Surface" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Acoustic panel from Main Line" }));
    expect(props.onChange).toHaveBeenCalledExactlyOnceWith([wallSurface.id]);
    expect(onEditSurface).not.toHaveBeenCalled();
  });

  it("allows a proposal-only surface catalog while preventing creation during a save", async () => {
    const user = userEvent.setup();
    const proposed = { id: "proposal-surface", name: "Acoustic panel" };
    const { props } = renderPanel({
      presentation: "overview", proposalActions: true, surfaces: [], proposedSurfaces: [proposed],
      selectedIds: [proposed.id], saving: true
    });

    expect(screen.queryByText("No surfaces have been added.")).not.toBeInTheDocument();
    expect(screen.queryByText("Unavailable value")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add Surface" }));
    expect(props.onQuickAdd).not.toHaveBeenCalled();
  });

  it.each(["loading", "error"] as const)("does not show a Procurement empty state while the surface catalog is %s", status => {
    renderPanel({ presentation: "procurement-basket", selectedIds: [], catalogState: { status }, canQuickAdd: false });
    expect(screen.getByRole("heading", { name: "Applicable surfaces" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    expect(screen.queryByText("No surfaces selected yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Selected surface details" })).not.toBeInTheDocument();
    expect(screen.getByText(status === "loading" ? "Loading surfaces…" : "Surfaces could not be loaded.")).toBeVisible();
  });

  it.each(["procurement-basket", "configuration"] as const)("keeps %s surface inspection read-only without hiding saved rows", async presentation => {
    const user = userEvent.setup();
    const { props } = renderPanel({ presentation, readOnly: true });
    expect(screen.getByRole("table", { name: "Selected surface details" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Wall surface from Main Line" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Applicable surfaces" }));
    expect(screen.getByRole("listbox", { name: "Surface options" })).toHaveAttribute("aria-readonly", "true");
    await user.click(screen.getByRole("option", { name: "Floor surface" }));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("shows each selected Surface's shared description as read-only context", () => {
    const described = { ...wallSurface, description: "Paint, wallpaper, texture, paneling" };
    renderPanel({
      selectedIds: [described.id, floorSurface.id, "surface-removed"],
      surfaces: [described, floorSurface]
    });

    const details = screen.getByRole("list", { name: "Selected surface details" });
    expect(within(details).getByText("Wall surface")).toBeVisible();
    expect(within(details).getByText("Paint, wallpaper, texture, paneling")).toBeVisible();
    /* A Surface with nothing recorded still lists, so the author can see the
       gap rather than wonder whether the description failed to load. */
    expect(within(details).getByText("Floor surface")).toBeVisible();
    expect(within(details).getByText("No examples recorded.")).toBeVisible();
    expect(within(details).getByText("Unavailable value")).toBeVisible();
    expect(within(details).getByText("This Surface is no longer available.")).toBeVisible();
    /* Descriptions are context only: this panel never edits them. */
    expect(within(details).queryByRole("textbox")).not.toBeInTheDocument();
    expect(details).not.toHaveTextContent("surface-removed");
  });

  it("omits the description list until the Surface catalog is ready", () => {
    renderPanel({ catalogState: { status: "loading" } });
    expect(screen.queryByRole("list", { name: "Selected surface details" })).not.toBeInTheDocument();
  });

  it("keeps the default presentation free of Overview table actions even when an editor is supplied", () => {
    renderPanel({ onEditSurface: vi.fn() });

    expect(screen.getByRole("list", { name: "Selected surface details" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit reusable surface/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove .* from Main Line/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Surface" })).not.toBeInTheDocument();
  });

  it.each(["overview", "configuration"] as const)("shows retained %s rows in selection order and only edits known non-archived reusable surfaces", async presentation => {
    const user = userEvent.setup();
    const retired = { ...floorSurface, status: "inactive" as const };
    const archived = { ...surface("surface-archived", "Archived ceiling"), status: "archived" as const };
    const onEditSurface = vi.fn();
    const { props } = renderPanel({
      presentation,
      selectedIds: [retired.id, "surface-unknown", archived.id, wallSurface.id],
      surfaces: [wallSurface, retired, archived],
      onEditSurface
    });

    const table = screen.getByRole("table", { name: "Selected surface details" });
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual([
      "Floor surfaceInactive", "Unavailable value", "Archived ceilingArchived", "Wall surface"
    ]);
    expect(within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(within(table).queryByRole("columnheader", { name: "Category" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Edit reusable surface Archived ceiling" })).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Edit reusable surface Unavailable value" })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Remove Unavailable value from Main Line" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Edit reusable surface Floor surface" }));
    expect(onEditSurface).toHaveBeenCalledExactlyOnceWith(retired);
    expect(props.onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove Archived ceiling from Main Line" }));
    expect(props.onChange).toHaveBeenCalledExactlyOnceWith([retired.id, "surface-unknown", wallSurface.id]);
    expect(onEditSurface).toHaveBeenCalledOnce();
  });

  it.each(["overview", "configuration"] as const)("allows %s unselection without reusable edit permission and keeps both create shortcuts on the same workflow", async presentation => {
    const user = userEvent.setup();
    const counterSurface = surface("surface-counter-returned", "Counter surface");
    const { props } = renderPanel({
      presentation,
      onQuickAdd: vi.fn((select) => select(counterSurface))
    });

    expect(screen.queryByRole("button", { name: /Edit reusable surface/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Surface" }));
    await user.click(screen.getByRole("button", { name: "Create Surface" }));
    expect(props.onQuickAdd).toHaveBeenCalledTimes(2);
    expect(props.onChange).toHaveBeenNthCalledWith(1, [wallSurface.id, counterSurface.id]);
    expect(props.onChange).toHaveBeenNthCalledWith(2, [wallSurface.id, counterSurface.id]);
    await user.click(screen.getByRole("button", { name: "Remove Wall surface from Main Line" }));
    expect(props.onChange).toHaveBeenLastCalledWith([]);
  });

  it.each([
    ["overview", "loading"], ["overview", "error"],
    ["configuration", "loading"], ["configuration", "error"]
  ] as const)("does not offer %s row actions while the catalog is %s", (presentation, status) => {
    renderPanel({
      presentation,
      catalogState: { status },
      onEditSurface: vi.fn()
    });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit reusable surface/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove .* from Main Line/u })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Surface" })).toBeDisabled();
  });

  it.each(["overview", "configuration"] as const)("keeps the empty %s table honest without adding categories or selection checkboxes", presentation => {
    renderPanel({ presentation, selectedIds: [] });

    expect(screen.getByRole("table", { name: "Selected surface details" })).toHaveTextContent("No surfaces selected.");
    expect(screen.queryByRole("button", { name: /Remove .* from Main Line/u })).not.toBeInTheDocument();
  });


  it("shows the approved labels and selects the returned quick-add stable ID", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const counterSurface = surface("surface-counter-returned", "Counter surface");
    renderPanel({
      onChange,
      onQuickAdd: (select) => select(counterSurface)
    });

    expect(screen.getByRole("heading", { level: 2, name: "Surfaces" })).toBeVisible();
    expect(screen.getByText("Select every surface where this Main Line can be used.")).toBeVisible();
    const selector = screen.getByRole("button", { name: "Applicable surfaces" });
    expect(selector).toHaveAccessibleDescription("Wall surface");
    await user.click(screen.getByRole("button", { name: "Add Surface" }));

    expect(onChange).toHaveBeenCalledWith([wallSurface.id, counterSurface.id]);
    expect(document.body).not.toHaveTextContent(counterSurface.id);
  });

  it("isolates initial-load, empty, refresh, and error states to Surface controls", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { rerender } = renderPanel({
      catalogState: { status: "loading" }
    });

    expect(screen.getByRole("status")).toHaveTextContent("Loading surfaces…");
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeDisabled();

    rerender(<KnowledgeModeSurfacePanel
      selectedIds={[]}
      surfaces={[]}
      catalogState={{ status: "ready" }}
      sectionState={{ status: "ready" }}
      readOnly={false}
      saving={false}
      dirty={false}
      canQuickAdd
      onChange={vi.fn()}
      onQuickAdd={vi.fn()}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("No surfaces have been added.");
    expect(screen.getByRole("button", { name: "Add Surface" })).toBeEnabled();

    rerender(<KnowledgeModeSurfacePanel
      selectedIds={[wallSurface.id]}
      surfaces={[wallSurface]}
      catalogState={{ status: "ready", refreshErrorMessage: "Offline", onRetry: retry }}
      sectionState={{ status: "ready" }}
      readOnly={false}
      saving={false}
      dirty={false}
      canQuickAdd
      onChange={vi.fn()}
      onQuickAdd={vi.fn()}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("Surface options may be out of date.");
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<KnowledgeModeSurfacePanel
      selectedIds={[wallSurface.id]}
      surfaces={[]}
      catalogState={{ status: "error", onRetry: retry }}
      sectionState={{ status: "ready" }}
      readOnly={false}
      saving={false}
      dirty={false}
      canQuickAdd
      onChange={vi.fn()}
      onQuickAdd={vi.fn()}
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("Surfaces could not be loaded.");
    expect(screen.getByRole("button", { name: "Applicable surfaces" })).toBeDisabled();
  });

  it("keeps retained inactive values readable and hides mutation actions when read-only", async () => {
    const user = userEvent.setup();
    const inactiveWall = { ...wallSurface, status: "inactive" as const };
    const onChange = vi.fn();
    renderPanel({
      selectedIds: [inactiveWall.id],
      surfaces: [inactiveWall, floorSurface],
      readOnly: true,
      onChange
    });

    expect(screen.getByText("Read-only revision")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Surface" })).not.toBeInTheDocument();
    const selector = screen.getByRole("button", { name: "Applicable surfaces" });
    expect(selector).not.toBeDisabled();
    await user.click(selector);
    const option = screen.getByRole("option", { name: "Wall surface (Inactive)" });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("listbox", { name: "Surface options" })).toHaveAttribute("aria-readonly", "true");
    await user.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations with the selector open over a retained inactive value and an error", async () => {
    const user = userEvent.setup();
    const retired = { ...surface("surface-retired", "Retired surface"), status: "inactive" as const };
    renderPanel({
      selectedIds: [wallSurface.id, retired.id],
      surfaces: [wallSurface, floorSurface, retired],
      dirty: true,
      error: "Surfaces could not be saved."
    }, { inLandmark: true });

    await user.click(screen.getByRole("button", { name: "Applicable surfaces" }));
    expect(screen.getByRole("option", { name: "Retired surface (Inactive)" })).toBeVisible();

    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });

    expect(results.violations).toEqual([]);
  });

  it("associates a Surface save error with the selector", () => {
    renderPanel({ error: "Choose at least one Surface." });

    const selector = screen.getByRole("button", { name: "Applicable surfaces" });
    const error = screen.getByRole("alert");
    expect(selector).toHaveAttribute("aria-invalid", "true");
    expect(error).toHaveTextContent("Choose at least one Surface.");
    expect(selector.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(selector).toHaveAccessibleDescription(/Choose at least one Surface\./u);
  });
});

function master(
  id: string,
  masterType: KnowledgeMaster["masterType"],
  name: string
): KnowledgeMaster {
  return {
    id,
    masterType,
    code: id.toUpperCase(),
    name,
    description: null,
    displayOrder: 1,
    status: "active",
    decimalScale: masterType === "uoms" ? 2 : undefined,
    version: 1,
    createdById: "super-admin-1",
    updatedById: "super-admin-1",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function surface(id: string, name: string): KnowledgeSurface {
  return {
    ...master(id, "surfaces", name),
    masterType: "surfaces"
  };
}
