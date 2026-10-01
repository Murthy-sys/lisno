import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/client";
import type { PlanDocumentWorkspace } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { getPlanDocuments, planDocumentKeys, preparePlanDocuments } from "./estimateDesignApi";
import { PlanDocumentPreview } from "./PlanDocumentPreview";

export function usePlanDocuments(estimateId: string, enabled: boolean, prepareEnabled: boolean, revisionKey: string) {
  const client = useQueryClient();
  const attempted = useRef(new Set<string>());
  const started = useRef(0);
  const query = useQuery({
    queryKey: planDocumentKeys.staff(estimateId),
    queryFn: () => getPlanDocuments(estimateId), enabled, retry: false,
    refetchInterval: (state) => state.state.data?.documents.some((doc) => doc.status === "preparing") && Date.now() - started.current < 150_000 ? 1500 : false
  });
  const prepare = useMutation({
    mutationFn: ({ id, hash }: { id: string; hash: string }) => preparePlanDocuments(id, hash),
    onSuccess: (data, variables) => {
      const key = planDocumentKeys.staff(variables.id);
      const current = client.getQueryData<PlanDocumentWorkspace>(key);
      if (current?.manifestHash === variables.hash && data.manifestHash === variables.hash) client.setQueryData(key, data);
      else void client.invalidateQueries({ queryKey: key });
    },
    onError: (_error, variables) => { void client.invalidateQueries({ queryKey: planDocumentKeys.staff(variables.id) }); }
  });
  const currentAttempt = prepare.variables?.id === estimateId && prepare.variables?.hash === query.data?.manifestHash;
  const preparing = currentAttempt && prepare.isPending;
  useEffect(() => {
    if (enabled) { started.current = Date.now(); void client.invalidateQueries({ queryKey: planDocumentKeys.staff(estimateId) }); }
  }, [client, enabled, estimateId, revisionKey]);
  useEffect(() => {
    const data = query.data;
    if (!enabled || !prepareEnabled || !data || query.isFetching || query.isError || prepare.isPending || !data.documents.length) return;
    // Earlier clients rejected differing image proportions. The renderer now
    // fits the complete revision, so recover that specific saved failure once.
    const retryProportions = data.documents.some((doc) => doc.status === "failed" && doc.failureCode === "PLAN_DOCUMENT_ASPECT_MISMATCH");
    const key = `${estimateId}:${data.manifestHash}${retryProportions ? ":proportional-fit" : ""}`;
    if (attempted.current.has(key) || (!retryProportions && !data.documents.some((doc) => doc.status === "not_prepared"))) return;
    attempted.current.add(key); started.current = Date.now();
    prepare.mutate({ id: estimateId, hash: data.manifestHash });
  }, [enabled, prepareEnabled, estimateId, query.data, query.isFetching, query.isError, prepare.isPending]);
  const preparationError = currentAttempt ? prepare.error : null;
  const failure = query.error ?? preparationError;
  const failedDocument = query.data?.documents.find((doc) => doc.status === "failed" || doc.status === "blocked");
  const blocker = query.isError ? (failure instanceof ApiError ? failure.message : "Refresh the full plan PDF before submitting.")
    : preparing ? "Preparing the updated full PDF before submission."
      : query.isPending || query.isFetching ? "Checking the updated full PDF before submission."
        : failedDocument ? failedDocument.failureMessage ?? "The updated full PDF could not be prepared. Use Refresh / retry full PDF."
          : failure ? (failure instanceof ApiError ? failure.message : "The updated full PDF could not be prepared. Use Refresh / retry full PDF.")
            : "The updated full PDF must finish preparing before submission.";
  return { query, preparing, preparationError, blocker, ready: Boolean(enabled && query.data?.readyForSubmission && !query.isFetching && !query.isError && !preparing), retry: () => {
    started.current = Date.now();
    if (query.data && !query.isError && prepareEnabled) prepare.mutate({ id: estimateId, hash: query.data.manifestHash });
    else void query.refetch();
  } };
}

export function PlanDocuments({ state }: { state: ReturnType<typeof usePlanDocuments> }) {
  const { query, preparing } = state;
  const failure = state.preparationError ?? query.error;
  return <section className="plan-documents" aria-label="Current full plan PDFs">
    <h3>Full plan PDF</h3>
    <p>Revised items fit inside their original PDF areas without stretching or cropping. Different proportions leave blank space around the image. Review the updated full PDF before submitting.</p>
    {query.isPending || query.isFetching ? <p role="status">Checking updated full plans…</p> : null}
    {preparing ? <p role="status">Preparing updated full PDF…</p> : null}
    {failure ? <p role="alert">{failure instanceof ApiError ? failure.message : "The updated PDFs could not be loaded."}</p> : null}
    {!query.isError ? query.data?.documents.map((doc) => <div className="plan-documents__document" key={`${doc.sourceUploadId}:${doc.manifestHash}`}>
      <strong>{doc.originalFilename}</strong>
      {doc.status === "ready" ? <><span>{doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} · Updated PDF ready</span><PlanDocumentPreview document={doc} /></> :
        <p role={doc.status === "failed" || doc.status === "blocked" ? "alert" : "status"}>{doc.failureMessage ?? (doc.status === "preparing" ? "Preparing updated full PDF…" : "The updated PDF will be prepared when drawing extraction is complete.")}</p>}
    </div>) : null}
    {failure || query.data?.documents.some((doc) => ["failed", "blocked", "preparing"].includes(doc.status)) ? <Button variant="secondary" disabled={preparing || query.isFetching} onClick={state.retry}>Refresh / retry full PDF</Button> : null}
  </section>;
}
