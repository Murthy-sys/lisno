import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Info, Lightbulb } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";
import { getKnowledgeBasketQuality, getKnowledgeSection } from "./knowledgeApi";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import type { KnowledgeItemDetail, KnowledgeJsonObject, KnowledgeMaster } from "./knowledgeTypes";

interface Props {
  readonly section: "recommendations" | "quality";
  readonly item: KnowledgeItemDetail;
  readonly revisionId?: string;
  readonly uoms: readonly KnowledgeMaster[];
  readonly uomState: { readonly status: "loading" | "ready" | "error"; readonly refreshErrorMessage?: string; readonly onRetry?: () => void };
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly children: ReactNode;
}

/** Context for the two reference tabs; the other tabs retain their existing rail. */
export function KnowledgeReferenceContextRail({ section, item, revisionId, uoms, uomState, dirty, saving, children }: Props) {
  const id = useId();
  const overview = useQuery({
    queryKey: knowledgeQueryKeys.section(item.mainLineId, revisionId ?? "", "overview"),
    queryFn: () => getKnowledgeSection<KnowledgeJsonObject>(item.mainLineId, revisionId!, "overview"),
    enabled: section === "recommendations" && Boolean(revisionId)
  });
  const quality = useQuery({
    queryKey: knowledgeQueryKeys.basketQuality(item.basketId),
    queryFn: () => getKnowledgeBasketQuality(item.basketId),
    enabled: section === "quality"
  });
  const savedUomId = overview.data?.payload.uomId;
  const uom = typeof savedUomId === "string" ? uoms.find((entry) => entry.id === savedUomId) : undefined;
  const uomLabel = !revisionId ? "Not set"
    : overview.isPending ? "Loading…"
      : !overview.data ? "Unavailable"
        : !savedUomId ? "Not set"
          : uomState.status === "loading" ? "Loading…"
            : uom?.name ?? "Unavailable";
  const checklist = quality.data;

  return <aside className="knowledge-reference-rail" aria-label={section === "quality" ? "Quality checklist context" : "Related item context"}>
    {section === "recommendations" ? <>
      <section className="knowledge-reference-card" aria-labelledby={`${id}-info`}>
        <h2 id={`${id}-info`}><Info aria-hidden="true" /> Quick Info</h2>
        <p className="knowledge-reference-card__item">{item.mainLineName}</p>
        {item.description ? <p className="knowledge-reference-card__description">{item.description}</p> : null}
        <dl className="knowledge-reference-facts">
          <div><dt>Main Basket</dt><dd>{item.basketName}</dd></div>
          <div><dt>Sub Basket</dt><dd>{item.subBasketName || "Not assigned"}</dd></div>
          <div><dt>UOM</dt><dd>{uomLabel}</dd></div>
        </dl>
        {overview.isError ? <p className="knowledge-reference-card__notice">{overview.data ? "Showing saved unit information. Refresh failed." : "Unit information could not be loaded."} <Button variant="quiet" size="compact" onClick={() => void overview.refetch()}>Retry unit information</Button></p> : null}
        {uomState.status === "error" || uomState.refreshErrorMessage ? <p className="knowledge-reference-card__notice">Unit names could not be refreshed. {uomState.onRetry ? <Button variant="quiet" size="compact" onClick={uomState.onRetry}>Retry units</Button> : null}</p> : null}
      </section>
      <section className="knowledge-reference-card knowledge-reference-card--tips" aria-labelledby={`${id}-tips`}>
        <h2 id={`${id}-tips`}><Lightbulb aria-hidden="true" /> Tips</h2>
        <ul>
          <li>Use mandatory additions for required related work.</li>
          <li>Use probable additions for optional choices.</li>
          <li>Explain why each item needs to be added or removed.</li>
          <li>Create a temporary item when the related scope is missing from the catalog.</li>
        </ul>
        <p>These rules guide scope decisions. Save this section to keep your changes.</p>
      </section>
    </> : <>
      <section className="knowledge-reference-card" aria-labelledby={`${id}-checklist`}>
        <h2 id={`${id}-checklist`}><ClipboardCheck aria-hidden="true" /> Shared checklist</h2>
        {quality.isPending ? <p role="status">Loading saved checklist…</p> : checklist ? <dl className="knowledge-reference-facts">
          <div><dt>Main Basket</dt><dd>{checklist.basketName}</dd></div>
          <div><dt>Saved version</dt><dd>{checklist.revisionId ? `Version ${checklist.revisionNumber}` : "Not saved yet"}</dd></div>
          <div><dt>Saved parameters</dt><dd>{checklist.parameters.length}</dd></div>
        </dl> : <p>Saved checklist unavailable.</p>}
        {quality.isError ? <p className="knowledge-reference-card__notice">{checklist ? "Saved details shown; refresh failed." : "Checklist details could not be loaded."} <Button variant="quiet" size="compact" onClick={() => void quality.refetch()}>Retry checklist details</Button></p> : null}
      </section>
      <section className="knowledge-reference-card" aria-labelledby={`${id}-policy`}>
        <h2 id={`${id}-policy`}><Info aria-hidden="true" /> Checklist information</h2>
        <ul>
          <li>Every listed check is required and active.</li>
          <li>All items in this Main Basket share the saved checklist.</li>
          <li>Use the Excel template to prepare checks, then review and import them.</li>
        </ul>
        <p>Excel downloads contain the saved checklist. Save edits first to include them.</p>
      </section>
      <p className={`knowledge-reference-status${!dirty && !saving && checklist?.revisionId && !quality.isError ? " knowledge-reference-status--saved" : ""}`} role="status">
        {saving ? <ClipboardCheck aria-hidden="true" /> : !dirty && checklist?.revisionId && !quality.isError ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}
        <span>{saving ? "Saving shared checklist…" : dirty ? "You have unsaved checklist changes." : quality.isPending ? "Loading configuration status…" : quality.isError ? "Refresh the checklist to confirm its saved status." : checklist?.revisionId ? "Shared checklist saved." : "No shared checklist saved yet."}</span>
      </p>
    </>}
    <details className="knowledge-reference-details">
      <summary>Saved details &amp; revision history</summary>
      <div className="knowledge-reference-details__body">{children}</div>
    </details>
  </aside>;
}
