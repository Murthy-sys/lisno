import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { Button } from "../../ui/primitives";
import { KnowledgeCard, KnowledgeText } from "../knowledge/knowledgeUi";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import type { ProtectedDocumentSource } from "../documents/useProtectedDocument";
import { designPlanKeys, getDesignDocuments, prepareDesignDocuments } from "./designPlanApi";
import { DesignCommandState, useDesignCommand, useDesignOwner } from "./DesignPlanControls";
import type { PlanDocuments } from "./designPlanModel";
export function PreparedPlanDocuments({ estimateId, session, revisionKey, enabled, canPrepare, onReady, onDenied }: { readonly estimateId: string; readonly session: AuthenticatedSession; readonly revisionKey: string; readonly enabled: boolean; readonly canPrepare: boolean; readonly onReady: (ready: boolean) => void; readonly onDenied: () => void }) {
  const owner = useDesignOwner(estimateId, session); const client = useQueryClient(); const [preview, setPreview] = useState<ProtectedDocumentSource | null>(null); const attempts = useRef(new Set<string>()); const started = useRef(Date.now());
  const key = [...designPlanKeys.documents(owner.scope, estimateId), revisionKey]; const allowed = canPerformOperation(session, "GET /estimates/:estimateId/design-plan-documents");
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => getDesignDocuments(owner.context.runtime, estimateId, signal), enabled: enabled && allowed, retry: false, staleTime: 0, refetchInterval: current => current.state.data?.documents.some(document => document.status === "preparing") && Date.now() - started.current < 150_000 ? 1500 : false });
  const command = useDesignCommand(owner, async () => undefined, onDenied);
  const readinessKey = useRef(revisionKey); readinessKey.current = revisionKey;
  useEffect(() => { onReady(false); started.current = Date.now(); }, [estimateId, enabled, revisionKey]);
  const ready = enabled && allowed && Boolean(query.data?.readyForSubmission && query.data.documents.length && query.data.documents.every(document => document.status === "ready") && query.data.reviewRoundId === null && !query.isFetching && !query.isError && !command.busy && !command.blocked);
  useEffect(() => onReady(ready), [ready, onReady]);
  async function prepare() {
    if (!query.data || !canPrepare || !canPerformOperation(session, "POST /estimates/:estimateId/design-plan-documents/prepare")) return;
    const hash = query.data.manifestHash; const frozenRevisionKey = revisionKey; started.current = Date.now();
    await command.run(() => prepareDesignDocuments(owner.context.runtime, estimateId, hash), { replaySafe: true, after: result => { const current = client.getQueryData<PlanDocuments>(key); if (current?.manifestHash === hash && readinessKey.current === frozenRevisionKey) client.setQueryData(key, result); else void client.invalidateQueries({ queryKey: key }); } });
  }
  useEffect(() => {
    const data = query.data; if (!enabled || !canPrepare || !data || query.isFetching || query.isError || command.busy || command.blocked || !data.documents.length) return;
    const retryOldProportions = data.documents.some(document => document.status === "failed" && document.failureCode === "PLAN_DOCUMENT_ASPECT_MISMATCH");
    const attempt = `${estimateId}:${data.manifestHash}:${retryOldProportions}`;
    if (!attempts.current.has(attempt) && (retryOldProportions || data.documents.some(document => document.status === "not_prepared"))) { attempts.current.add(attempt); void prepare(); }
  }, [revisionKey, enabled, canPrepare, query.data, query.isFetching, query.isError, command.busy, command.blocked]);
  if (!enabled || !allowed) return null;
  return <KnowledgeCard title="Full plan PDFs">
    <KnowledgeText>Review the updated full PDF before submission. Revised drawings fit their original areas without stretching.</KnowledgeText>
    {query.isFetching || query.isPending || command.busy ? <KnowledgeText>Preparing or checking updated full plans…</KnowledgeText> : null}
    {query.isError ? <KnowledgeText error>The current full plans could not be loaded.</KnowledgeText> : query.data?.documents.map(document => <KnowledgeCard key={document.sourceUploadId} title={document.originalFilename}>
      <KnowledgeText>{document.status === "ready" ? `${document.pageCount} pages · Updated PDF ready` : document.failureMessage ?? document.status.replaceAll("_", " ")}</KnowledgeText>
      {document.status === "ready" && document.documentId && canPerformOperation(session, "GET /estimates/:estimateId/design-plan-documents/:documentId/pdf") ? <Button label={`Open full PDF: ${document.originalFilename}`} variant="quiet" onPress={() => setPreview({ path: `/estimates/${encodeURIComponent(estimateId)}/design-plan-documents/${encodeURIComponent(document.documentId!)}/pdf`, fileName: document.originalFilename, mimeType: "application/pdf", kind: "design-file" })} /> : null}
    </KnowledgeCard>)}
    {!ready ? <KnowledgeText>Full plan preparation must finish before drawings can be submitted.</KnowledgeText> : null}
    <DesignCommandState command={command} />
    <Button label="Refresh / retry full PDF" variant="secondary" disabled={command.busy || query.isFetching} onPress={() => { command.reset(); if (query.data && !query.isError && canPrepare) void prepare(); else void query.refetch(); }} />
    <ProtectedDocumentViewer visible={preview !== null} source={preview} onClose={() => setPreview(null)} />
  </KnowledgeCard>;
}
