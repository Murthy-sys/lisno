import { useQueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { SiteCompletionPanel } from "./SiteCompletionPanel";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "site-manager-1", role: "site_manager" },
    authorization: { role: "site_manager", permissions: ["procurement.site_completion.manage"] } })
}));

beforeEach(() => { vi.stubGlobal("crypto", { randomUUID: () => "reverify-key-123" }); });

describe("Site Manager completion re-verification", () => {
  it("allows a same-value 100% save when the approved work scope changed", async () => {
    let current = { projectId: "project-1", projectStatus: "active", version: 1, progress: 100,
      note: "Inspect all work", status: "draft", currentRound: 0, canSubmit: false, needsReverification: true,
      blockers: ["Approved work sections changed after the Site Manager marked 100%. Save 100% again to verify the current sections."], review: null };
    const writes: unknown[] = [];
    server.use(
      http.get("/api/v1/projects/project-1/site-completion", () => HttpResponse.json({ data: current })),
      http.patch("/api/v1/projects/project-1/site-completion/progress", async ({ request }) => {
        writes.push(await request.json());
        current = { ...current, version: 2, needsReverification: false, canSubmit: true, blockers: [] };
        return HttpResponse.json({ data: current });
      })
    );

    renderWithQuery(<SiteCompletionPanel projectId="project-1" projectName="Aurora Villa" />);
    const reverify = await screen.findByRole("button", { name: "Reverify 100% progress" });
    expect(reverify).toBeEnabled();
    expect(screen.getByRole("button", { name: "Complete and send to Client" })).toBeDisabled();
    await userEvent.click(reverify);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ expectedVersion: 1, progress: 100, note: "Inspect all work" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Complete and send to Client" })).toBeEnabled());
  });
});

describe("Site Manager completion progress", () => {
  it.each([false, true])("saves 100%% with a blank note and uses backend canSubmit=%s", async canSubmit => {
    let current = { projectId: "project-1", projectStatus: "active", version: 1, progress: 0,
      note: "", status: "draft", currentRound: 0, canSubmit: false, needsReverification: false,
      blockers: ["Save 100% progress first."], review: null };
    const writes: unknown[] = [];
    server.use(
      http.get("/api/v1/projects/project-1/site-completion", () => HttpResponse.json({ data: current })),
      http.patch("/api/v1/projects/project-1/site-completion/progress", async ({ request }) => {
        writes.push(await request.json());
        current = { ...current, version: 2, progress: 100, canSubmit,
          blockers: canSubmit ? [] : ["Approved work sections still need review."] };
        return HttpResponse.json({ data: current });
      })
    );

    renderWithQuery(<SiteCompletionPanel projectId="project-1" projectName="Aurora Villa" />);
    await userEvent.clear(await screen.findByRole("spinbutton", { name: "Project execution progress (%)" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "Project execution progress (%)" }), "100");
    expect(screen.getByRole("button", { name: "Complete and send to Client" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save 100% progress" }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ expectedVersion: 1, progress: 100, note: "" });
    await waitFor(() => expect(screen.getByText("Saved progress").parentElement).toHaveTextContent("100%"));
    const send = screen.getByRole("button", { name: "Complete and send to Client" });
    await waitFor(() => {
      if (canSubmit) expect(send).toBeEnabled();
      else expect(send).toBeDisabled();
    });
  });
});


it("preserves the edited note and its version when a live update arrives", async () => {
  const original = { projectId: "project-1", projectStatus: "active", version: 1, progress: 50,
    note: "Original note", status: "draft", currentRound: 0, canSubmit: false, needsReverification: false, blockers: [], review: null };
  const writes: unknown[] = [];
  server.use(
    http.get("/api/v1/projects/project-1/site-completion", () => HttpResponse.json({ data: original })),
    http.patch("/api/v1/projects/project-1/site-completion/progress", async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "State changed. Reload latest values." } }, { status: 409 });
    })
  );
  function LiveUpdate() {
    const client = useQueryClient();
    return <button onClick={() => client.setQueryData(["site-completion", "project-1"], { ...original, version: 2, note: "Another manager update" })}>Simulate committed update</button>;
  }
  renderWithQuery(<><SiteCompletionPanel projectId="project-1" projectName="QA project" /><LiveUpdate /></>);
  const field = await screen.findByRole("textbox", { name: "Completion note" });
  await userEvent.clear(field); await userEvent.type(field, "My pending note");
  await userEvent.click(screen.getByRole("button", { name: "Simulate committed update" }));
  expect(field).toHaveValue("My pending note");
  await userEvent.click(screen.getByRole("button", { name: "Save progress" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ expectedVersion: 1, note: "My pending note" });
  expect(field).toHaveValue("My pending note");
});
