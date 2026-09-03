import { KnowledgeModeSurfacePanel } from "../../features/ai-estimator-knowledge/KnowledgeModeSurfacePanel";
import { KnowledgeReusableValuesPage } from "../../features/ai-estimator-knowledge/KnowledgeReusableValuesPage";
import { KnowledgeSurfaceEditorDialog } from "../../features/ai-estimator-knowledge/KnowledgeSurfaceEditorDialog";
import type { KnowledgeMaster, KnowledgeSurface } from "../../features/ai-estimator-knowledge/knowledgeTypes";
import "../../features/ai-estimator-knowledge/ai-estimator-knowledge.css";

export type SurfaceQaState =
  | "panel"
  | "panel-loading"
  | "panel-error"
  | "panel-empty"
  | "panel-stale"
  | "panel-retained"
  | "panel-readonly"
  | "dialog-add"
  | "dialog-edit"
  | "management"
  | "management-empty";

export const SURFACE_QA_STATES: readonly SurfaceQaState[] = [
  "panel",
  "panel-loading",
  "panel-error",
  "panel-empty",
  "panel-stale",
  "panel-retained",
  "panel-readonly",
  "dialog-add",
  "dialog-edit",
  "management",
  "management-empty"
];

const timestamp = "2026-09-03T08:00:00.000Z";

function master(
  id: string,
  masterType: KnowledgeMaster["masterType"],
  name: string,
  displayOrder: number
): KnowledgeMaster {
  return {
    id,
    masterType,
    code: id.toUpperCase(),
    name,
    description: null,
    displayOrder,
    status: "active",
    version: 1,
    createdById: "user-super-admin",
    updatedById: "user-super-admin",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function surface(
  id: string,
  name: string,
  overrides: Partial<KnowledgeSurface> = {}
): KnowledgeSurface {
  return {
    ...master(id, "surfaces", name, 1),
    masterType: "surfaces",
    description: "Paint, wallpaper, texture, paneling, tiles",
    ...overrides
  };
}

export const squareFoot = master("uom-square-foot", "uoms", "Sq.ft", 1);
export const runningFoot = master("uom-running-foot", "uoms", "Running ft", 2);
export const wallSurface = surface("surface-wall", "Wall surface");
export const counterSurface = surface("surface-counter", "Counter surface");
/* A long name is the layout stress case the QA matrix needs at 320 px, so it
   belongs in the fixture rather than in a hand-made screenshot. */
export const longSurface = surface(
  "surface-long",
  "Ceiling finish with a deliberately long presentation label that must remain readable"
);
export const retiredSurface = surface(
  "surface-retired",
  "Retired ceiling surface",
  { status: "inactive" }
);

const surfaces = [wallSurface, counterSurface, longSurface, retiredSurface];

export function SurfaceQaPage({ state }: { readonly state: SurfaceQaState }) {
  if (state === "management" || state === "management-empty") {
    return <KnowledgeReusableValuesPage />;
  }

  if (state === "dialog-add") {
    return <KnowledgeSurfaceEditorDialog quickAdd onClose={() => undefined} />;
  }

  if (state === "dialog-edit") {
    return <KnowledgeSurfaceEditorDialog existing={counterSurface} onClose={() => undefined} />;
  }

  const catalogState = state === "panel-loading"
    ? { status: "loading" as const }
    : state === "panel-error"
      ? { status: "error" as const, onRetry: () => undefined }
      : state === "panel-stale"
        ? {
            status: "ready" as const,
            refreshErrorMessage: "The Surface catalog could not be refreshed.",
            onRetry: () => undefined
          }
        : { status: "ready" as const };

  return (
    <section
      aria-label="Surfaces"
      className="knowledge-workspace-section knowledge-mode-block knowledge-mode-surface-block"
    >
      <KnowledgeModeSurfacePanel
        selectedIds={state === "panel-retained"
          ? [wallSurface.id, retiredSurface.id, "surface-deleted-elsewhere"]
          : state === "panel-empty"
            ? []
            : [wallSurface.id, counterSurface.id, longSurface.id]}
        surfaces={state === "panel-empty" ? [] : surfaces}
        catalogState={catalogState}
        sectionState={{ status: "ready", onRetry: () => undefined }}
        readOnly={state === "panel-readonly"}
        saving={false}
        dirty={state === "panel-retained"}
        canQuickAdd={state !== "panel-readonly"}
        error={state === "panel-retained"
          ? "Surfaces could not be saved. Review the selection and try again."
          : undefined}
        onChange={() => undefined}
        onQuickAdd={() => undefined}
      />
    </section>
  );
}
