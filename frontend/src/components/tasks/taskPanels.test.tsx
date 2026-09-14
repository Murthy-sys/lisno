import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import type { TaskRecord } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { DesignUploadDialog } from "./DesignUploadDialog";
import { TaskUpdateDialog } from "./TaskUpdateDialog";

const task: TaskRecord = {
  id: "task-north", projectId: "project-north", floorId: "floor-ground", stageId: "stage-plan",
  title: "Circulation plan", description: "Resolve movement paths.", order: 2, ownerId: "designer-north",
  plannedStartAt: "2026-09-01T09:00:00.000Z", originalDeadlineAt: "2026-09-20T17:00:00.000Z",
  currentDeadlineAt: "2026-09-25T17:00:00.000Z", plannedEffort: 16, progress: 55,
  dependencyTaskIds: [], latestUpdateAt: null, status: "in_progress", completedAt: null, version: 3,
  createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-02T09:00:00.000Z"
};

afterEach(() => vi.restoreAllMocks());

describe("Task contextual forms", () => {
  it("keeps edits on Escape and requires explicit discard before closing", async () => {
    const close = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<TaskUpdateDialog task={task} userId={task.ownerId} onClose={close} onSaved={vi.fn()} />);
    const note = screen.getByLabelText("Note (optional)");
    await user.type(note, "Coordinate the new doorway");
    await user.keyboard("{Escape}");
    const confirmation = screen.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    expect(close).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "Keep editing" }));
    expect(note).toHaveValue("Coordinate the new doorway");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains the entered values after a failed save and blocks dismissal while saving", async () => {
    let reject!: (error: Error) => void;
    const patch = vi.spyOn(apiClient, "patch").mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    const close = vi.fn();
    const saved = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<TaskUpdateDialog task={task} userId={task.ownerId} onClose={close} onSaved={saved} />);
    const progress = screen.getByLabelText("Progress");
    await user.clear(progress);
    await user.type(progress, "70");
    await user.type(screen.getByLabelText("Note (optional)"), "Doorway resolved");
    await user.click(screen.getByRole("button", { name: "Save update" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/tasks/task-north", { version: 3, status: "in_progress", progress: 70, note: "Doorway resolved" }));
    expect(progress).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => reject(new Error("The update could not be saved.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("The update could not be saved.");
    expect(progress).toHaveValue(70);
    expect(progress).toBeEnabled();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Doorway resolved");
    expect(saved).not.toHaveBeenCalled();
  });

  it("submits from the sticky footer and closes successfully without a discard prompt", async () => {
    const updated = { ...task, progress: 70, version: 4 };
    vi.spyOn(apiClient, "patch").mockResolvedValue(updated);
    const close = vi.fn();
    const saved = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<TaskUpdateDialog task={task} userId={task.ownerId} onClose={close} onSaved={saved} />);
    await user.clear(screen.getByLabelText("Progress"));
    await user.type(screen.getByLabelText("Progress"), "70");
    await user.click(screen.getByRole("button", { name: "Save update" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(updated));
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("preserves the selected upload through guarded dismissal and a failed request", async () => {
    vi.spyOn(apiClient, "postMultipart").mockRejectedValue(new Error("Offline"));
    const close = vi.fn();
    const uploaded = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<DesignUploadDialog task={task} onClose={close} onUploaded={uploaded} />);
    const input = screen.getByLabelText("Design file") as HTMLInputElement;
    const file = new File(["design"], "circulation.pdf", { type: "application/pdf" });
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(input.files?.[0]).toBe(file);
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The design file could not be uploaded. Please try again.");
    expect(input.files?.[0]).toBe(file);
    expect(close).not.toHaveBeenCalled();
    expect(uploaded).not.toHaveBeenCalled();
  });
});
