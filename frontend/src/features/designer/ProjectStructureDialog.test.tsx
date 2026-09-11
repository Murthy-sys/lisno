import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { designerKeys } from "./designerApi";
import { ProjectStructureDialog } from "./ProjectStructureDialog";

const canonicalStages = [
  ["internal_kickoff", "Internal Kick off"],
  ["client_kickoff", "Client Kick off"],
  ["key_collection", "Key Collection"],
  ["site_measurement", "On Site Actual Measurement"],
  ["existing_furniture_dimensions", "Collection of existing furniture dimensions"],
  ["space_planning_tentative_look_feel", "Designer Uploading Space planning with Tentative look and Feel"]
] as const;

function renderStageDialog() {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  renderWithQuery(
    <ProjectStructureDialog
      action={{ kind: "stage", projectId: "project-one", floorId: "floor-ground", nextOrder: 3 }}
      onCreated={onCreated}
      onClose={onClose}
    />
  );
  return { onCreated, onClose };
}

afterEach(() => vi.restoreAllMocks());

describe("ProjectStructureDialog stage choices", () => {
  it("offers the six spreadsheet stages first in order and retains the remaining legacy types", () => {
    renderStageDialog();
    const select = screen.getByRole("combobox", { name: "Stage type" });
    const options = within(select).getAllByRole("option");
    expect(options.map((option) => [option.getAttribute("value"), option.textContent])).toEqual([
      ...canonicalStages,
      ["concept_mood_board", "Concept and mood board"],
      ["floor_plan", "Floor plan"],
      ["client_revisions", "Client revisions"],
      ["final_approval", "Final approval"],
      ["design_handoff", "Design handoff"]
    ]);
    expect(select).toHaveValue("internal_kickoff");
    expect(screen.getByRole("textbox", { name: "Stage name" })).toHaveValue("Internal Kick off");
  });

  it("keeps default names aligned with the selected stage while preserving custom names", async () => {
    const user = userEvent.setup();
    renderStageDialog();
    const select = screen.getByRole("combobox", { name: "Stage type" });
    const name = screen.getByRole("textbox", { name: "Stage name" });
    await user.selectOptions(select, "site_measurement");
    expect(name).toHaveValue("On Site Actual Measurement");
    await user.clear(name);
    await user.selectOptions(select, "existing_furniture_dimensions");
    expect(name).toHaveValue("Collection of existing furniture dimensions");
    await user.clear(name);
    await user.type(name, "Existing furniture at client's apartment");
    await user.selectOptions(select, "space_planning_tentative_look_feel");
    expect(name).toHaveValue("Existing furniture at client's apartment");
    await user.selectOptions(select, "concept_mood_board");
    expect(name).toHaveValue("Existing furniture at client's apartment");
  });

  it.each(canonicalStages.slice(4))("submits %s with its exact stage name and refreshes the project workflow", async (type, name) => {
    let requestBody: unknown;
    server.use(http.post("/api/v1/floors/floor-ground/stages", async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json({ data: { id: "stage-created", name, type, order: 3 } }, { status: 201 });
    }));
    const invalidation = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    const { onCreated, onClose } = renderStageDialog();
    await user.selectOptions(screen.getByRole("combobox", { name: "Stage type" }), type);
    await user.click(screen.getByRole("button", { name: "Create stage" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(requestBody).toEqual({ name, type, order: 3 });
    expect(onCreated).toHaveBeenCalledWith(`${name} was added.`);
    expect(invalidation).toHaveBeenCalledWith({ queryKey: designerKeys.project("project-one") });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: projectWorkflowKeys.designWorkflow("project-one") });
  });

  it("submits a custom stage name with an existing legacy type unchanged", async () => {
    let requestBody: unknown;
    server.use(http.post("/api/v1/floors/floor-ground/stages", async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json({ data: { id: "stage-created", name: "Terrace concept" } }, { status: 201 });
    }));
    const user = userEvent.setup();
    const { onClose } = renderStageDialog();
    const name = screen.getByRole("textbox", { name: "Stage name" });
    await user.clear(name);
    await user.type(name, "Terrace concept");
    await user.selectOptions(screen.getByRole("combobox", { name: "Stage type" }), "concept_mood_board");
    await user.click(screen.getByRole("button", { name: "Create stage" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(requestBody).toEqual({ name: "Terrace concept", type: "concept_mood_board", order: 3 });
  });
});
