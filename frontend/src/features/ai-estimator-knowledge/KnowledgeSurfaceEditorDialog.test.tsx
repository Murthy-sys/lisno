import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import { KnowledgeSurfaceEditorDialog } from "./KnowledgeSurfaceEditorDialog";
import * as knowledgeApi from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeMaster, KnowledgeSurface } from "./knowledgeTypes";

vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    listKnowledgeMasters: vi.fn(),
    listKnowledgeSurfaces: vi.fn(),
    createKnowledgeSurface: vi.fn(),
    updateKnowledgeSurface: vi.fn()
  };
});

const timestamp = "2026-09-03T08:00:00.000Z";

function renderDialog(
  props: Partial<React.ComponentProps<typeof KnowledgeSurfaceEditorDialog>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeSurfaceEditorDialog
        onClose={onClose}
        onSaved={onSaved}
        {...props}
      />
    </QueryClientProvider>
  );
  return { ...view, onClose, onSaved, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeApi.listKnowledgeSurfaces).mockResolvedValue({
    items: [surface("surface-wall", "Wall surface", "Server examples")],
    pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
  });
  vi.mocked(knowledgeApi.createKnowledgeSurface).mockImplementation(async (input) =>
    surface("surface-wall", input.name, input.description ?? null)
  );
  vi.mocked(knowledgeApi.updateKnowledgeSurface).mockImplementation(async (id, input) =>
    surface(id, input.name ?? "Wall surface", input.description ?? null)
  );
});

describe("KnowledgeSurfaceEditorDialog", () => {
  it("creates a freeform Surface with no technical UI or payload fields", async () => {
    const user = userEvent.setup();
    const { onSaved, onClose, queryClient } = renderDialog();
    vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(
      new Error("Background refresh failed.")
    );
    const dialog = screen.getByRole("dialog", { name: "Add Surface" });

    expect(within(dialog).getByRole("textbox", { name: "Surface name" })).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Examples / components" })).toBeVisible();
    expect(within(dialog).queryByRole("textbox", { name: "Code" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Stable ID|Display order|Version/iu)).not.toBeInTheDocument();

    await user.click(await within(dialog).findByRole("button", { name: "Add Surface" }));
    expect(within(dialog).getByRole("textbox", { name: "Surface name" })).toHaveFocus();
    expect(within(dialog).getByText("Enter a Surface name.")).toBeVisible();

    await user.type(within(dialog).getByRole("textbox", { name: "Surface name" }), "Counter surface");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Examples / components" }),
      "Granite, quartz, marble"
    );
    await user.click(within(dialog).getByRole("button", { name: "Add Surface" }));

    await waitFor(() => expect(knowledgeApi.createKnowledgeSurface).toHaveBeenCalledWith({
      name: "Counter surface",
      description: "Granite, quartz, marble"
    }));
    expect(knowledgeApi.createKnowledgeSurface).toHaveBeenCalledWith(
      expect.not.objectContaining({ code: expect.anything(), displayOrder: expect.anything() })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: "surface-wall"
    })));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData<{ items: readonly KnowledgeSurface[] }>(
      knowledgeQueryKeys.masterCatalog("surfaces")
    )?.items).toEqual([
      expect.objectContaining({ id: "surface-wall" })
    ]);
  });

  it("maps duplicate and stale-version responses without clearing the form draft", async () => {
    const user = userEvent.setup();
    vi.mocked(knowledgeApi.createKnowledgeSurface).mockRejectedValueOnce(
      new ApiError(409, "DUPLICATE_IDENTITY", "Duplicate identity.")
    );
    const first = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Add Surface" });
    await user.type(await within(dialog).findByRole("textbox", { name: "Surface name" }), "Wall surface");
    await user.click(within(dialog).getByRole("button", { name: "Add Surface" }));
    expect(await within(dialog).findByText("A Surface with this name already exists.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: "Surface name" })).toHaveValue("Wall surface");
    first.unmount();

    vi.mocked(knowledgeApi.updateKnowledgeSurface).mockRejectedValueOnce(
      new ApiError(409, "VERSION_CONFLICT", "Changed elsewhere.")
    );
    renderDialog({
      existing: surface("surface-wall", "Wall surface", "Paint")
    });
    const editDialog = screen.getByRole("dialog", { name: "Edit Surface" });
    const examples = await within(editDialog).findByRole("textbox", { name: "Examples / components" });
    await user.clear(examples);
    await user.type(examples, "Local unsaved examples");
    await user.click(within(editDialog).getByRole("button", { name: "Save changes" }));
    expect(await within(editDialog).findByText("This Surface changed elsewhere")).toBeVisible();
    expect(examples).toHaveValue("Local unsaved examples");
    vi.mocked(knowledgeApi.listKnowledgeSurfaces).mockResolvedValueOnce({
      items: [{
        ...surface("surface-wall", "Wall surface", "Server examples"),
        version: 9
      }],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false }
    });
    await user.click(within(editDialog).getByRole("button", { name: "Load latest version" }));
    expect(await within(editDialog).findByText(/latest Surface version is loaded/iu)).toBeVisible();
    expect(examples).toHaveValue("Local unsaved examples");
    await user.click(within(editDialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(knowledgeApi.updateKnowledgeSurface).toHaveBeenLastCalledWith(
      "surface-wall",
      expect.objectContaining({
        expectedVersion: 9,
        description: "Local unsaved examples"
      })
    ));
  });

  it("has no automated semantic accessibility violations", async () => {
    renderDialog();
    expect(await screen.findByRole("textbox", { name: "Surface name" })).toBeVisible();
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });
});

function surface(
  id: string,
  name: string,
  description: string | null
): KnowledgeSurface {
  return {
    id,
    masterType: "surfaces",
    code: id.toUpperCase(),
    name,
    description,
    displayOrder: 1,
    status: "active",
    version: 3,
    createdById: "super-admin-1",
    updatedById: "super-admin-1",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
