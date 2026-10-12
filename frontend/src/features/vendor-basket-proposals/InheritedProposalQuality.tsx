import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { KnowledgeQualityChecklistEditor } from "../ai-estimator-knowledge/KnowledgeQualityChecklistEditor";
import type { KnowledgeEditorDataSource } from "../ai-estimator-knowledge/knowledgeEditorDataSource";
import { proposalError } from "./proposalPresentation";

/** Existing-parent quality is current context, never part of the editable proposal. */
export function InheritedProposalQuality({ basketId, source }: { basketId: string; source: KnowledgeEditorDataSource }) {
  const quality = useQuery({ queryKey: source.basketQualityKey(basketId), queryFn: () => source.getBasketQuality(basketId), refetchOnWindowFocus: "always", gcTime: 0 });
  const frequencies = useQuery({ queryKey: source.qualityControlOptionsKey("frequency"), queryFn: () => source.listQualityControlOptions("frequency"), gcTime: 0 });
  const performers = useQuery({ queryKey: source.qualityControlOptionsKey("performer"), queryFn: () => source.listQualityControlOptions("performer"), gcTime: 0 });
  if (quality.isPending) return <PageState state="loading" message="Loading inherited Quality Parameters…" />;
  if (quality.isError) return <PageState state="error" message={proposalError(quality.error)} action={{ label: "Retry inherited quality", onAction: () => void quality.refetch() }} />;
  return <section className="knowledge-basket-quality" aria-label="Inherited Quality Parameters">
    <div className="knowledge-basket-quality__intro"><h2>Quality Parameters</h2><p>Current inherited checklist from <strong>{quality.data.basketName}</strong>. These parameters are read-only and are maintained in Configuration. They are not part of the submitted changes.</p><p>{quality.data.revisionId ? `Checklist version ${quality.data.revisionNumber}` : "No shared checklist saved"}</p></div>
    {frequencies.isError || performers.isError ? <InlineMessage tone="warning" action={<Button variant="quiet" onClick={() => void Promise.all([frequencies.refetch(), performers.refetch()])}>Retry quality values</Button>}>Some reusable Quality Parameter values could not be loaded.</InlineMessage> : null}
    <KnowledgeQualityChecklistEditor parameters={quality.data.parameters} savedParameters={quality.data.parameters} basketName={quality.data.basketName} disabled readOnly validationAttempt={0} qualityOptions={{ frequency: frequencies.data?.items ?? [], performer: performers.data?.items ?? [] }} qualityOptionsLoading={{ frequency: frequencies.isPending, performer: performers.isPending }} canCreateQualityOptions={false} onChange={() => undefined} />
  </section>;
}
