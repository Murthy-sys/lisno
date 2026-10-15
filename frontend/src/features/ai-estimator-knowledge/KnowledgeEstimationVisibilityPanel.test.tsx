import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { KnowledgeEstimationVisibilityPanel } from "./KnowledgeEstimationVisibilityPanel";
import * as api from "./knowledgeApi";
import * as sync from "./knowledgeMutationSync";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

vi.mock("./knowledgeApi", () => ({ getKnowledgeItem: vi.fn(), updateKnowledgeMainLine: vi.fn() }));
vi.mock("./knowledgeMutationSync", () => ({ commitKnowledgeMainLineMutation: vi.fn(), refreshKnowledgeMainLineCatalog: vi.fn() }));
const item: KnowledgeItemDetail = {
  id: "line-a", mainLineId: "line-a", mainLineName: "Wall finish", basketId: "basket-a", basketName: "Walls",
  description: "", status: "active", version: 4, itemType: "main_line", completionRequired: false,
  activeRevisionId: null, draftRevisionId: null, revisionNumber: null, uomId: null, priorityId: null,
  modeIds: [], surfaceIds: [], vendorIds: [], allowedActions: [], activeRevision: null, draftRevision: null,
  completeness: { percentage: 0, sections: [], blockers: [], warnings: [] }, blockers: [], warnings: [],
  createdById: "admin", updatedById: "admin", createdAt: "2026-10-14T01:00:00Z", updatedAt: "2026-10-14T01:00:00Z"
};
function setup(current = item, canUpdate = true) {
  const onDirtyChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><KnowledgeEstimationVisibilityPanel item={current} canUpdate={canUpdate} onDirtyChange={onDirtyChange} onSavingChange={vi.fn()} /></QueryClientProvider>);
  return { ...view, onDirtyChange };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sync.refreshKnowledgeMainLineCatalog).mockResolvedValue();
  vi.mocked(api.updateKnowledgeMainLine).mockResolvedValue({ ...item, estimationVisibility: "external", version: 5 });
});

describe("Main Line estimation visibility", () => {
  it("requires a versioned confirmation when the lost-response GET still has the original version", async () => {
    let saved = { ...item, estimationVisibility: "internal" as "internal" | "external" };
    let lateCommit!: () => boolean;
    vi.mocked(api.updateKnowledgeMainLine).mockImplementation(async (_id, input) => {
      if (!lateCommit) {
        lateCommit = () => {
          if (saved.version !== input.expectedVersion) return false;
          saved = { ...saved, estimationVisibility: input.estimationVisibility!, version: saved.version + 1 };
          return true;
        };
        throw new Error("response timed out before server completed");
      }
      expect(input.expectedVersion).toBe(saved.version);
      saved = { ...saved, estimationVisibility: input.estimationVisibility!, version: saved.version + 1 };
      return saved;
    });
    vi.mocked(api.getKnowledgeItem).mockImplementation(async () => saved);
    const { onDirtyChange } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByText(/latest read has not confirmed/)).toBeVisible();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("radio", { name: /^Internal/ }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    const confirm = screen.getByRole("button", { name: "Confirm visibility" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByText("Estimation visibility saved.")).toBeVisible();
    expect(api.updateKnowledgeMainLine).toHaveBeenLastCalledWith("line-a", { expectedVersion: 4, estimationVisibility: "internal" });
    expect(lateCommit()).toBe(false);
    expect(saved).toMatchObject({ estimationVisibility: "internal", version: 5 });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each(["network", "server"])("reconciles a committed PATCH with lost %s response before allowing a change back to Internal", async (failure) => {
    const external = { ...item, estimationVisibility: "external" as const, version: 5 };
    vi.mocked(api.updateKnowledgeMainLine)
      .mockRejectedValueOnce(failure === "network" ? new Error("response lost") : new ApiError(503, "UNAVAILABLE", "response lost"))
      .mockResolvedValueOnce({ ...item, estimationVisibility: "internal", version: 6 });
    vi.mocked(api.getKnowledgeItem).mockResolvedValue(external);
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByText("Current saved visibility: External. Your selection is saved.")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Internal/ })).toBeEnabled());
    expect(api.getKnowledgeItem).toHaveBeenCalledExactlyOnceWith("line-a");
    await user.click(screen.getByRole("radio", { name: /^Internal/ }));
    expect(screen.getByRole("button", { name: "Save visibility" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    await waitFor(() => expect(api.updateKnowledgeMainLine).toHaveBeenLastCalledWith("line-a", { expectedVersion: 5, estimationVisibility: "internal" }));
    expect(await screen.findByText("Estimation visibility saved.")).toBeVisible();
  });

  it("locks unknown saved state until an authoritative retry load succeeds and preserves the selected intent", async () => {
    vi.mocked(api.updateKnowledgeMainLine).mockRejectedValueOnce(new Error("response lost"));
    vi.mocked(api.getKnowledgeItem).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...item, estimationVisibility: "external", version: 5 });
    const { onDirtyChange } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Saved visibility is unknown");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("radio", { name: /^External/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Internal/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save visibility" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry load" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /^Internal/ })).toBeEnabled());
    expect(screen.queryByText("Saved visibility is unknown")).not.toBeInTheDocument();
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("radio", { name: /^Internal/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    await waitFor(() => expect(api.updateKnowledgeMainLine).toHaveBeenLastCalledWith("line-a", { expectedVersion: 5, estimationVisibility: "internal" }));
  });

  it("keeps the intended External choice unsaved when reconciliation confirms the PATCH did not commit", async () => {
    vi.mocked(api.updateKnowledgeMainLine).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...item, version: 7, estimationVisibility: "internal" });
    const { onDirtyChange } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByText(/Current saved visibility: Internal/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save visibility" })).toBeEnabled());
    expect(screen.getByRole("radio", { name: /^External/ })).toBeChecked();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    await waitFor(() => expect(api.updateKnowledgeMainLine).toHaveBeenLastCalledWith("line-a", { expectedVersion: 7, estimationVisibility: "external" }));
  });

  it("defaults legacy visibility to Internal and saves only metadata even without a draft revision", async () => {
    const { container, onDirtyChange } = setup();
    expect(screen.getByRole("radio", { name: /^Internal/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save visibility" })).toBeDisabled();
    const user = userEvent.setup();
    screen.getByRole("radio", { name: /^Internal/ }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /^External/ })).toBeChecked();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByText("Estimation visibility saved.")).toBeVisible();
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledExactlyOnceWith("line-a", { expectedVersion: 4, estimationVisibility: "external" });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it.each(["read-only", "archived", "temporary"])("disables metadata editing for %s", (state) => {
    setup({ ...item, ...(state === "archived" ? { status: "archived" } : {}), ...(state === "temporary" ? { itemType: "temporary" } : {}) }, state !== "read-only");
    expect(screen.getByRole("radio", { name: /^External/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save visibility" })).not.toBeInTheDocument();
  });

  it("preserves the selected visibility across conflict and retries with the explicitly loaded version", async () => {
    vi.mocked(api.updateKnowledgeMainLine).mockRejectedValueOnce(new ApiError(409, "VERSION_CONFLICT", "Changed"));
    vi.mocked(api.getKnowledgeItem).mockResolvedValue({ ...item, version: 8 });
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Main Line changed");
    expect(screen.getByRole("button", { name: "Save visibility" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Load current Main Line" }));
    expect(await screen.findByText(/Current saved visibility: Internal/)).toBeVisible();
    expect(screen.getByRole("radio", { name: /^External/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    await waitFor(() => expect(api.updateKnowledgeMainLine).toHaveBeenLastCalledWith("line-a", { expectedVersion: 8, estimationVisibility: "external" }));
  });

  it("retries only reads when the write succeeds but refreshing dependent views fails", async () => {
    vi.mocked(sync.refreshKnowledgeMainLineCatalog).mockRejectedValueOnce(new Error("offline"));
    setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    const retry = await screen.findByRole("button", { name: "Retry views refresh" });
    expect(screen.getByRole("radio", { name: /^Internal/ })).toBeDisabled();
    await user.click(retry);
    await waitFor(() => expect(retry).not.toBeInTheDocument());
    expect(api.updateKnowledgeMainLine).toHaveBeenCalledTimes(1);
    expect(sync.refreshKnowledgeMainLineCatalog).toHaveBeenCalledTimes(2);
  });

  it("preserves choice and unsaved state after a failed write", async () => {
    vi.mocked(api.updateKnowledgeMainLine).mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "Rejected"));
    const { onDirtyChange } = setup(); const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^External/ }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your selection is preserved");
    expect(screen.getByRole("radio", { name: /^External/ })).toBeChecked();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(sync.commitKnowledgeMainLineMutation).not.toHaveBeenCalled();
  });
});
