import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "../../api/types";
import { server } from "../../test/server";
import { renderWithQuery } from "../../test/render";
import { DeadlineRevisionDialog } from "./DeadlineRevisionDialog";

const task: TaskRecord = {
  id: "task-a", projectId: "project-a", floorId: "floor-a", stageId: "stage-a", title: "Concept review", description: "", order: 1, ownerId: "designer-a", plannedStartAt: "2026-07-01T09:00:00.000Z", originalDeadlineAt: "2026-07-12T09:00:00.000Z", currentDeadlineAt: "2026-07-15T09:00:00.000Z", plannedEffort: 8, progress: 20, dependencyTaskIds: [], latestUpdateAt: null, version: 7, createdAt: "2026-07-01T09:00:00.000Z", updatedAt: "2026-07-02T09:00:00.000Z", status: "in_progress", completedAt: null
};

function setup() {
  const onClose = vi.fn();
  const onConflict = vi.fn().mockResolvedValue(undefined);
  renderWithQuery(<DeadlineRevisionDialog task={task} onClose={onClose} onConflict={onConflict} />);
  return { onClose, onConflict };
}

describe("Deadline revision panel", () => {
  it("protects the rationale on close and retains failed input with the original version for retry", async () => {
    const submitted: unknown[] = [];
    server.use(http.patch("/api/v1/tasks/task-a/deadline", async ({ request }) => {
      submitted.push(await request.json());
      return submitted.length === 1 ? HttpResponse.json({ error: { code: "REQUEST_FAILED", message: "Unavailable" } }, { status: 503 }) : HttpResponse.json({ data: task });
    }));
    const user = userEvent.setup();
    const { onClose } = setup();
    fireEvent.change(screen.getByLabelText("New deadline"), { target: { value: "2026-07-18T10:00" } });
    await user.type(screen.getByLabelText("Deadline revision reason"), "Client requested review time");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await user.click(screen.getByRole("button", { name: "Save deadline" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deadline could not be revised.");
    expect(screen.getByLabelText("Deadline revision reason")).toHaveValue("Client requested review time");
    await user.click(screen.getByRole("button", { name: "Save deadline" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(submitted).toEqual(Array(2).fill({ version: 7, currentDeadlineAt: new Date("2026-07-18T10:00").toISOString(), reason: "Client requested review time" }));
  });

  it("refreshes a conflict and prevents submitting the stale form again", async () => {
    const patch = vi.fn();
    server.use(http.patch("/api/v1/tasks/task-a/deadline", () => {
      patch();
      return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "Changed" } }, { status: 409 });
    }));
    const { onClose, onConflict } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Deadline revision reason"), "Revised review slot");
    await user.click(screen.getByRole("button", { name: "Save deadline" }));
    await waitFor(() => expect(onConflict).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: "Review refreshed task" })).toBeVisible();
    expect(screen.getByLabelText("New deadline")).toBeDisabled();
    expect(screen.getByLabelText("Deadline revision reason")).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("New deadline").closest("form")!);
    expect(patch).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Review refreshed task" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
