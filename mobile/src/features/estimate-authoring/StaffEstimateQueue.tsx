import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ScrollView } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, StateView } from "../../ui/primitives";
import { ApiError } from "../../core/http/apiClient";
import { getStaffEstimateQueue, staffEstimateQueueKey } from "./staffEstimateApi";
import { EstimateSection, EstimateText, EstimateTheme, estimateStyles } from "./EstimateUI";
import { StaffEstimateLifecycle } from "./StaffEstimateLifecycle";
import type { EstimateDraft, SavedEstimate } from "./types";
import { estimatePaise } from "./staffEstimateModel";

export function StaffEstimateQueue({ session, onOpenLead }: { readonly session: AuthenticatedSession; readonly onOpenLead: (leadId: string) => void }) {
  const context = useConfiguredRuntime();
  const canReview = canPerformOperation(session, "GET /estimates/review-queue");
  const canList = canPerformOperation(session, "GET /estimates");
  const [reviewSelected, setReviewSelected] = useState(!canList && canReview);
  const review = reviewSelected && canReview;
  const path = review ? "/estimates/review-queue" : "/estimates";
  const allowed = session.user.role !== "client" && canPerformOperation(session, `GET ${path}`);
  const query = useQuery({ queryKey: staffEstimateQueueKey({ environmentId: context.environment.environment.id, userId: session.user.id }, path), queryFn: ({ signal }) => getStaffEstimateQueue(context.runtime, path, signal), enabled: allowed && context.environment.status === "ready" });
  if (!allowed) return <StateView tone="denied" title="Estimates unavailable" message="Your account cannot open this queue." />;
  if (query.isPending) return <BrandLoader label="Loading estimates" tone="dark" />;
  if (query.isError) return <StateView tone={query.error instanceof ApiError && [401, 403, 404].includes(query.error.status) ? "denied" : "error"} title="Estimates could not be verified" message="Refresh the current queue before continuing." actionLabel="Refresh estimates" onAction={() => void query.refetch()} />;
  return <EstimateTheme><ScrollView contentContainerStyle={estimateStyles.screen}>
    {canReview && canList ? <Button label={review ? "Show saved estimates" : "Show approval queue"} variant="secondary" onPress={() => setReviewSelected(!review)} /> : null}<EstimateText>{review ? "Estimates awaiting your review" : "Saved estimates"}</EstimateText>
    {!query.data?.length ? <EstimateText>No estimates are available in this queue.</EstimateText> : null}
    {query.data?.map((estimate) => <EstimateSection key={estimate.id} title={estimate.lead?.projectName ?? "Project estimate"}>
      <EstimateText>{estimate.lead?.clientName ?? "Client"} · {(estimate.estimation?.status ?? estimate.status).replaceAll("_", " ")}</EstimateText>
      <EstimateText>{estimatePaise(estimate.totalPaise ?? Math.round(estimate.total * 100))} · Version {estimate.version}</EstimateText>
      {canPerformOperation(session, "GET /leads/:leadId") && canPerformOperation(session, "GET /leads/:leadId/estimate") ? <Button label={`Open ${estimate.lead?.projectName ?? "estimate"}`} variant="secondary" onPress={() => onOpenLead(estimate.leadId)} /> : null}
      {review ? <QueueActions key={`${estimate.id}:${estimate.version}`} estimate={estimate} session={session} refresh={() => query.refetch({ throwOnError: true })} /> : null}
    </EstimateSection>)}
  </ScrollView></EstimateTheme>;
}

function QueueActions({ estimate, session, refresh }: { readonly estimate: SavedEstimate; readonly session: AuthenticatedSession; readonly refresh: () => Promise<unknown> }) {
  const client = useQueryClient(); const context = useConfiguredRuntime();
  const pending = useRef(false); const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false); const [message, setMessage] = useState("");
  async function execute(work: () => Promise<EstimateDraft | null>, notice: string) {
    if (pending.current || blocked) return false;
    pending.current = true;
    setBusy(true); setMessage("");
    try { await work(); setMessage(notice); await refresh().catch(() => setMessage(`${notice} Refresh the queue to load current details.`)); return true; }
    catch (cause) {
      setBlocked(true); setMessage(cause instanceof ApiError ? cause.message : "The result could not be confirmed. Refresh the queue before retrying.");
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) client.setQueryData(staffEstimateQueueKey({ environmentId: context.environment.environment.id, userId: session.user.id }, "/estimates/review-queue"), []);
      return false;
    } finally { pending.current = false; setBusy(false); }
  }
  return <><StaffEstimateLifecycle estimate={estimate} session={session} disabled={busy || blocked} execute={execute} />{message ? <EstimateText>{message}</EstimateText> : null}{blocked ? <Button label="Refresh approval queue" onPress={() => void refresh().then(() => setBlocked(false)).catch(() => setMessage("The approval queue could not be refreshed."))} /> : null}</>;
}
