import axe from "axe-core";
import { render, screen } from "@testing-library/react";
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
