import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import type { KnowledgeMaster } from "./knowledgeTypes";

/*
 * A catalog-backed dropdown with nothing in it looks exactly like a broken
 * screen. These cover the case that actually reached production: the priority
 * catalog was never provisioned, the request succeeded with zero rows, and
 * Recommendations rendered an empty Priority list saying nothing at all.
 */

const priority: KnowledgeMaster = {
  id: "knowledge-priority-bootstrap-high",
  code: "HIGH",
  name: "High",
  description: null,
  displayOrder: 1,
  status: "active",
  version: 1,
  createdById: "user-1",
  updatedById: "user-1",
  createdAt: "2026-09-04T00:00:00.000Z",
  updatedAt: "2026-09-04T00:00:00.000Z"
} as unknown as KnowledgeMaster;

function renderRecommendations(
  masters: Record<string, readonly KnowledgeMaster[]>,
  states: Record<string, unknown>
) {
  return render(
    <KnowledgeSectionEditor
      sectionKey="recommendations"
      payload={{ recommendations: [], exclusions: [] }}
      masters={masters}
      relationshipBaskets={[]}
      relationshipItems={[]}
      currentMainLineId="line-1"
      readOnly={false}
      canQuickAdd
      resetKey="r1"
      masterCatalogStates={states as never}
      onChange={() => {}}
      onDirty={() => {}}
      onValidationChange={() => {}}
      onQuickAdd={() => {}}
    />
  );
}

describe("reusable-value catalog notices", () => {
  it("says the priority list is empty instead of rendering a silent dropdown", () => {
    renderRecommendations({ priorities: [] }, { priorities: { status: "ready" } });
    expect(screen.getByText(/No priorities are configured yet/)).toBeVisible();
    expect(screen.getByText(/Estimation configuration/)).toBeVisible();
  });

  it("stays quiet once the catalog has an active entry", () => {
    renderRecommendations({ priorities: [priority] }, { priorities: { status: "ready" } });
    expect(screen.queryByText(/No priorities are configured/)).not.toBeInTheDocument();
  });

  it("treats a catalog of only inactive entries as empty, matching what the control offers", () => {
    renderRecommendations(
      { priorities: [{ ...priority, status: "inactive" } as KnowledgeMaster] },
      { priorities: { status: "ready" } }
    );
    expect(screen.getByText(/No priorities are configured yet/)).toBeVisible();
  });

  it("distinguishes a failed load from an empty one, and offers a retry", async () => {
    const onRetry = vi.fn();
    renderRecommendations(
      { priorities: [] },
      { priorities: { status: "error", errorMessage: "Priorities are unavailable.", onRetry } }
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Priorities are unavailable.");
    expect(screen.queryByText(/No priorities are configured/)).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says it is still loading rather than claiming the catalog is empty", () => {
    renderRecommendations({ priorities: [] }, { priorities: { status: "loading" } });
    expect(screen.getByText(/Loading priorities…/)).toBeVisible();
    expect(screen.queryByText(/No priorities are configured/)).not.toBeInTheDocument();
  });

  it("reports only the catalogs the open section actually uses", () => {
    render(
      <KnowledgeSectionEditor
        sectionKey="scope"
        payload={{ exclusions: [], modeIds: [], surfaceIds: [] }}
        masters={{ modes: [], surfaces: [], priorities: [] }}
        relationshipBaskets={[]}
        relationshipItems={[]}
        currentMainLineId="line-1"
        readOnly={false}
        canQuickAdd
        resetKey="r1"
        masterCatalogStates={{
          modes: { status: "ready" },
          surfaces: { status: "ready" },
          priorities: { status: "ready" }
        } as never}
        onChange={() => {}}
        onDirty={() => {}}
        onValidationChange={() => {}}
        onQuickAdd={() => {}}
      />
    );
    /* Scope reads modes and surfaces; priorities belong to Recommendations. */
    expect(screen.getByText(/No modes are configured yet/)).toBeVisible();
    expect(screen.getByText(/No surfaces are configured yet/)).toBeVisible();
    expect(screen.queryByText(/No priorities are configured/)).not.toBeInTheDocument();
  });
});
