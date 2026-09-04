import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeItemWorkspacePage } from "./KnowledgeItemWorkspacePage";
import * as knowledgeApi from "./knowledgeApi";
import * as knowledgeMutationSync from "./knowledgeMutationSync";
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeRevision,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "authenticated",
    user: { id: "super-admin-1", name: "Super Admin", email: "admin@lisno.example", role: "super_admin" },
    authorization: {},
    sessionExpired: false
  })
}));
vi.mock("../../auth/authorization", () => ({ hasFrontendPermission: () => true }));
vi.mock("./knowledgeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeApi")>();
  return {
    ...actual,
    activateKnowledgeRevision: vi.fn(),
    permanentlyDeleteKnowledgeMainLine: vi.fn(),
    deactivateKnowledgeItem: vi.fn(),
    getKnowledgeHistory: vi.fn(),
    getKnowledgeItem: vi.fn(),
    getKnowledgeSection: vi.fn(),
    listKnowledgeBaskets: vi.fn(),
    listKnowledgeItems: vi.fn(),
    listKnowledgeMasters: vi.fn()
  };
});
vi.mock("./knowledgeMutationSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./knowledgeMutationSync")>();
  return {
    ...actual,
    syncKnowledgeLifecycleMutation: vi.fn(),
    syncKnowledgeMainLineDeletion: vi.fn()
  };
});

const pagination = { limit: 100, offset: 0, total: 0, hasMore: false } as const;
const completeness: KnowledgeCompleteness = { percentage: 50, sections: [], blockers: [], warnings: [] };
const revision: KnowledgeRevision = {
  id: "revision-1",
  mainLineId: "line-1",
  revisionNumber: 1,
  status: "draft",
  sourceRevisionId: null,
  contentDigest: null,
  completeness,
  activatedAt: null,
  activatedById: null,
  supersededAt: null,
  supersededById: null,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-31T08:00:00.000Z",
  updatedAt: "2026-08-31T08:00:00.000Z"
};
const draftItem: KnowledgeItemDetail = {
  id: "line-1",
  mainLineId: "line-1",
  mainLineName: "Wall panelling",
  basketId: "basket-1",
  basketName: "Carpentry",
  description: "Wall panelling knowledge",
  status: "draft",
  activeRevisionId: null,
  draftRevisionId: revision.id,
  revisionNumber: 1,
  uomId: null,
  priorityId: null,
  modeIds: [],
  surfaceIds: [],
  vendorIds: [],
  completeness,
  allowedActions: ["update_section", "review_and_activate", "duplicate", "archive"],
  activeRevision: null,
  draftRevision: revision,
  blockers: [],
  warnings: [],
  version: 4,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: revision.createdAt,
  updatedAt: revision.updatedAt
};

function section(sectionKey: KnowledgeSectionKey): KnowledgeSectionEnvelope {
  return {
    id: `section-${sectionKey}`,
    mainLineId: draftItem.mainLineId,
    revisionId: revision.id,
    sectionKey,
    applicability: "configured",
    payload: {},
    version: 2,
    createdById: "super-admin-1",
    updatedById: "super-admin-1",
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt
  };
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/configuration/estimation/items/line-1"]}>
        <Routes>
          <Route path="/admin/configuration/estimation/items/:itemId" element={<KnowledgeItemWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function submitReasonedLifecycleAction(buttonName: "Delete" | "Deactivate", reason: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: buttonName }));
  await user.type(screen.getByRole("textbox", { name: "Reason" }), reason);
  await user.click(screen.getByRole("button", { name: buttonName === "Delete" ? "Delete permanently" : "Deactivate item" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(draftItem);
  vi.mocked(knowledgeApi.getKnowledgeHistory).mockResolvedValue({ items: [revision], pagination });
  vi.mocked(knowledgeApi.getKnowledgeSection).mockImplementation(async (_mainLineId, _revisionId, sectionKey) => section(sectionKey));
  vi.mocked(knowledgeApi.listKnowledgeBaskets).mockResolvedValue({ items: [], pagination });
  vi.mocked(knowledgeApi.listKnowledgeItems).mockResolvedValue({ items: [], pagination: { ...pagination, limit: 20 } });
  vi.mocked(knowledgeApi.listKnowledgeMasters).mockResolvedValue({ items: [], pagination });
  vi.mocked(knowledgeMutationSync.syncKnowledgeLifecycleMutation).mockResolvedValue();
  vi.mocked(knowledgeMutationSync.syncKnowledgeMainLineDeletion).mockResolvedValue();
});

describe("Estimation Item deletion redirect", () => {
  it("redirects with replacement only after deletion cache synchronization succeeds", async () => {
    let finishSynchronization: (() => void) | undefined;
    const synchronization = new Promise<void>((resolve) => { finishSynchronization = resolve; });
    const receipt = { mainLineId: "line-1", deleted: true as const, deletedAt: "2026-09-04T12:00:00.000Z" };
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine).mockResolvedValue(receipt);
    vi.mocked(knowledgeMutationSync.syncKnowledgeMainLineDeletion).mockReturnValue(synchronization);
    renderWorkspace();

    await submitReasonedLifecycleAction("Delete", "No longer used");

    await waitFor(() => expect(knowledgeApi.permanentlyDeleteKnowledgeMainLine).toHaveBeenCalledWith("line-1", {
      expectedVersion: draftItem.version,
      reason: "No longer used"
    }));
    /* The row is gone, so the cached detail is dropped rather than written back. */
    expect(knowledgeMutationSync.syncKnowledgeMainLineDeletion).toHaveBeenCalledWith(expect.any(QueryClient), "line-1");
    expect(knowledgeMutationSync.syncKnowledgeLifecycleMutation).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();

    finishSynchronization?.();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/admin/configuration/estimation", { replace: true }));
  });

  it("keeps the delete dialog and workspace in place when the request fails", async () => {
    vi.mocked(knowledgeApi.permanentlyDeleteKnowledgeMainLine).mockRejectedValue(new Error("Deletion is temporarily unavailable."));
    renderWorkspace();

    await submitReasonedLifecycleAction("Delete", "No longer used");

    expect(await screen.findByRole("alert")).toHaveTextContent("Deletion is temporarily unavailable.");
    expect(screen.getByRole("alertdialog", { name: "Delete this Main Line?" })).toBeVisible();
    expect(screen.getByRole("heading", { name: draftItem.mainLineName })).toBeVisible();
    expect(knowledgeMutationSync.syncKnowledgeLifecycleMutation).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not redirect after successful activation", async () => {
    const activated = { ...draftItem, status: "active" as const, allowedActions: ["deactivate", "archive"] as const };
    vi.mocked(knowledgeApi.activateKnowledgeRevision).mockResolvedValue(activated);
    renderWorkspace();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review and activate" }));
    await user.click(screen.getByRole("button", { name: "Activate revision" }));

    await waitFor(() => expect(knowledgeMutationSync.syncKnowledgeLifecycleMutation).toHaveBeenCalledWith(expect.any(QueryClient), activated));
    expect(await screen.findByText(/Revision activated/u)).toHaveAttribute("role", "status");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not redirect after successful deactivation", async () => {
    const activeRevision = { ...revision, status: "active" as const, activatedAt: revision.updatedAt, activatedById: "super-admin-1" };
    const activeItem: KnowledgeItemDetail = {
      ...draftItem,
      status: "active",
      activeRevisionId: activeRevision.id,
      activeRevision,
      draftRevisionId: null,
      draftRevision: null,
      allowedActions: ["deactivate", "archive"]
    };
    const deactivated = { ...activeItem, status: "inactive" as const, allowedActions: ["archive"] as const };
    vi.mocked(knowledgeApi.getKnowledgeItem).mockResolvedValue(activeItem);
    vi.mocked(knowledgeApi.deactivateKnowledgeItem).mockResolvedValue(deactivated);
    renderWorkspace();

    await submitReasonedLifecycleAction("Deactivate", "Temporarily unavailable");

    await waitFor(() => expect(knowledgeMutationSync.syncKnowledgeLifecycleMutation).toHaveBeenCalledWith(expect.any(QueryClient), deactivated));
    expect(await screen.findByText("Item deactivated.")).toHaveAttribute("role", "status");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
