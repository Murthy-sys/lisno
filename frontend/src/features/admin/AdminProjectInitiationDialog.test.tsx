import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { AdminProjectSummary } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { AdminProjectInitiationDialog } from "./AdminProjectInitiationDialog";

const estimator = {
  id: "estimator-1",
  name: "Ravi Estimator",
  email: "ravi@lisno.example",
  title: "Senior Estimator"
};

const createdProject: AdminProjectSummary = {
  id: "project-created",
  name: "Asha home",
  status: "planning",
  location: "Pune",
  client: { name: "Asha Shah", email: "asha@example.com", mobile: "+91 90000 00000" },
  propertyType: "3BHK",
  budgetMin: 800000,
  budgetMax: 1200000,
  estimator: { id: estimator.id, name: estimator.name, email: estimator.email },
  lead: {
    id: "lead-created",
    stage: "new_lead",
    nextAction: "Schedule site visit",
    nextActionAt: "2026-08-25T05:00:00.000Z"
  },
  estimate: null,
  createdAt: "2026-08-23T10:00:00.000Z"
};

function estimatorPage(items = [estimator]) {
  return {
    data: {
      items,
      pagination: { limit: 20, offset: 0, total: items.length, hasMore: false }
    }
  };
}

function requiredLabel(name: string) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*?$`);
}

function renderDialog({
  onClose = vi.fn(),
  onCreated = vi.fn()
}: {
  onClose?: () => void;
  onCreated?: (project: AdminProjectSummary) => void;
} = {}) {
  return {
    onClose,
    onCreated,
    ...renderWithQuery(
      <MemoryRouter>
        <AdminProjectInitiationDialog onClose={onClose} onCreated={onCreated} />
      </MemoryRouter>
    )
  };
}

async function selectEstimator(user: ReturnType<typeof userEvent.setup>) {
  const combobox = screen.getByRole("combobox", { name: "Estimator/Sales" });
  await user.click(combobox);
  expect(await screen.findByRole("option", { name: /Ravi Estimator/ })).toBeVisible();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(combobox).toHaveValue("Ravi Estimator");
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const fields = {
    "Client name": "Asha Shah",
    "Client email": "asha@example.com",
    Mobile: "+91 90000 00000",
    "Project / property name": "Asha home",
    Location: "Pune",
    "Property type": "3BHK",
    "Minimum budget": "800000",
    "Maximum budget": "1200000",
    "Next action": "Schedule site visit",
    "Next action date": "2026-08-25T10:30"
  } as const;
  for (const [name, value] of Object.entries(fields)) {
    await user.type(screen.getByLabelText(requiredLabel(name)), value);
  }
  await selectEstimator(user);
}

describe("AdminProjectInitiationDialog", () => {
  it("renders exactly the approved required controls and excludes unsupported Lead fields", async () => {
    server.use(
      http.get("/api/v1/admin/estimators", () => HttpResponse.json(estimatorPage()))
    );
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Initiate project" });
    for (const name of [
      "Client name",
      "Client email",
      "Mobile",
      "Project / property name",
      "Location",
      "Property type",
      "Minimum budget",
      "Maximum budget",
      "Next action",
      "Next action date",
      "Estimator/Sales"
    ]) {
      expect(within(dialog).getByLabelText(requiredLabel(name))).toBeRequired();
    }
    for (const name of ["Source", "Lead source", "Builder", "Area", "Target handover", "Notes"]) {
      expect(within(dialog).queryByLabelText(name)).not.toBeInTheDocument();
    }
  });

  it("supports loading, server options, debounced search, keyboard selection, empty, and retryable error states", async () => {
    let requestCount = 0;
    let fail = false;
    const searches: string[] = [];
    let releaseInitial!: () => void;
    const initial = new Promise<void>((resolve) => { releaseInitial = resolve; });
    server.use(
      http.get("/api/v1/admin/estimators", async ({ request }) => {
        requestCount += 1;
        const search = new URL(request.url).searchParams.get("search") ?? "";
        searches.push(search);
        if (requestCount === 1) await initial;
        if (fail) {
          return HttpResponse.json(
            { error: { code: "FAILED", message: "Lookup unavailable." } },
            { status: 503 }
          );
        }
        return HttpResponse.json(estimatorPage(search === "nobody" ? [] : [estimator]));
      })
    );

    const user = userEvent.setup();
    renderDialog();
    const combobox = screen.getByRole("combobox", { name: "Estimator/Sales" });
    await user.click(combobox);
    expect(within(screen.getByRole("dialog", { name: "Initiate project" })).getByRole("status")).toHaveTextContent("Loading options");
    releaseInitial();
    expect(await screen.findByRole("option", { name: /Ravi Estimator/ })).toBeVisible();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(combobox).toHaveValue("Ravi Estimator");

    await user.clear(combobox);
    await user.type(combobox, "nobody");
    await waitFor(() => expect(searches).toContain("nobody"), { timeout: 1200 });
    expect(await screen.findByText("No options found.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Initiate project" })).toBeDisabled();

    fail = true;
    await user.clear(combobox);
    await user.type(combobox, "broken");
    expect(await screen.findByText("Lookup unavailable.", {}, { timeout: 1200 })).toBeVisible();
    expect(screen.getByRole("button", { name: "Initiate project" })).toBeDisabled();

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("option", { name: /Ravi Estimator/ })).toBeVisible();
    expect(requestCount).toBeGreaterThanOrEqual(4);
    expect(searches.filter((search) => search === "nobody")).toHaveLength(1);
  });

  it("submits one exact strict payload and disables duplicate activation", async () => {
    let body: unknown;
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    server.use(
      http.get("/api/v1/admin/estimators", () => HttpResponse.json(estimatorPage())),
      http.post("/api/v1/admin/projects", async ({ request }) => {
        requests += 1;
        body = await request.json();
        await pending;
        return HttpResponse.json({ data: createdProject }, { status: 201 });
      })
    );

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    const submit = screen.getByRole("button", { name: "Initiate project" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(requests).toBe(1));
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(body).toEqual({
      clientName: "Asha Shah",
      clientEmail: "asha@example.com",
      clientMobile: "+91 90000 00000",
      projectName: "Asha home",
      location: "Pune",
      propertyType: "3BHK",
      budgetMin: 800000,
      budgetMax: 1200000,
      nextAction: "Schedule site visit",
      nextActionAt: expect.stringMatching(/Z$/),
      estimatorId: "estimator-1"
    });
    expect(body).not.toHaveProperty("source");
    release();
  });

  it("retains every value, renders field feedback, and focuses the first server-invalid control", async () => {
    server.use(
      http.get("/api/v1/admin/estimators", () => HttpResponse.json(estimatorPage())),
      http.post("/api/v1/admin/projects", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed.",
              fields: {
                clientEmail: "This email belongs to an internal account.",
                estimatorId: "Select an active Estimator/Sales user."
              }
            }
          },
          { status: 400 }
        )
      )
    );

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Initiate project" }));

    const email = await screen.findByRole("textbox", { name: "Client email" });
    expect(email).toHaveFocus();
    expect(email).toHaveValue("asha@example.com");
    expect(email).toHaveAccessibleDescription("This email belongs to an internal account.");
    expect(screen.getByRole("combobox", { name: "Estimator/Sales" })).toHaveValue("Ravi Estimator");
    expect(screen.getByText("Select an active Estimator/Sales user.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Project / property name" })).toHaveValue("Asha home");
  });

  it("invalidates project queries, announces success, closes, and returns the created project", async () => {
    server.use(
      http.get("/api/v1/admin/estimators", () => HttpResponse.json(estimatorPage())),
      http.post("/api/v1/admin/projects", () =>
        HttpResponse.json({ data: createdProject }, { status: 201 })
      )
    );
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onClose, onCreated });
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Initiate project" }));

    expect(await screen.findByText("The Estimator/Sales handoff is ready.")).toBeVisible();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-projects"] });
      expect(onClose).toHaveBeenCalledOnce();
      expect(onCreated).toHaveBeenCalledWith(createdProject);
    });
  });
});
