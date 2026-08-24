import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { EstimateClientResponseTaskDetail } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { DownloadButton } from "../../components/ui/DownloadButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { ClientResponseDecisionDialog } from "./ClientResponseDecisionDialog";
import {
  downloadEstimateClientResponsePdf,
  downloadEstimateClientResponseProof,
  estimateClientResponseKeys,
  getEstimateClientResponse
} from "./estimateClientResponsesApi";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});

const statusPresentation: Record<
  EstimateClientResponseTaskDetail["status"],
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes requested", tone: "danger" }
};

const deliveryPresentation: Record<
  EstimateClientResponseTaskDetail["deliveryStatus"],
  { label: string; tone: StatusTone }
> = {
  queued: { label: "Email queued", tone: "info" },
  sent: { label: "Email sent", tone: "success" },
  failed: { label: "Email delivery failed", tone: "danger" },
  disabled: { label: "Email unavailable", tone: "warning" }
};

function detailErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "The requested Client response task was not found.";
  }
  return error instanceof ApiError
    ? error.message
    : "We couldn't load this Client response task.";
}

function decisionSourceLabel(
  source: EstimateClientResponseTaskDetail["decisionSource"]
): string {
  if (source === "admin_proof") return "Recorded with Admin proof";
  if (source === "client_portal") return "Recorded through the Client portal";
  return "Awaiting Client response";
}

type Decision = "approve" | "request_changes";
type SelectedDecision = {
  decision: Decision;
  task: EstimateClientResponseTaskDetail;
};

export function ClientResponseTaskDetailPage() {
  const { roundId = "" } = useParams();
  const auth = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState<SelectedDecision | null>(null);
  const taskQuery = useQuery({
    queryKey: estimateClientResponseKeys.detail(roundId),
    queryFn: () => getEstimateClientResponse(roundId),
    enabled: Boolean(roundId)
  });
  const task = taskQuery.data;
  const canDecide = hasFrontendPermission(
    auth.authorization,
    "estimation.client_response_tasks.decide"
  );
  const canReadProof = hasFrontendPermission(
    auth.authorization,
    "estimation.client_response_proof.read"
  );

  if (taskQuery.isPending) {
    return <PageState state="loading" message="Loading Client response task…" />;
  }
  if (taskQuery.isError) {
    return (
      <PageState
        state="error"
        message={detailErrorMessage(taskQuery.error)}
        action={
          taskQuery.error instanceof ApiError && taskQuery.error.status === 404
            ? undefined
            : { label: "Try again", onAction: () => void taskQuery.refetch() }
        }
      />
    );
  }
  if (!task) {
    return (
      <PageState
        state="empty"
        message="The requested Client response task was not found."
      />
    );
  }

  const presentation = statusPresentation[task.status];
  const delivery = deliveryPresentation[task.deliveryStatus];
  const pendingDecision = task.status === "pending" && canDecide;
  const selectedTaskIsCurrent = Boolean(
    selected?.task.id === task.id &&
      selected.task.status === task.status &&
      selected.task.version === task.version &&
      task.status === "pending"
  );

  return (
    <section
      className="client-responses client-response-detail"
      aria-labelledby="client-response-detail-title"
    >
      <PageHeader
        id="client-response-detail-title"
        eyebrow="Estimate response task"
        title={`${task.client.name} response`}
        description="Review the immutable Estimate sent to the Client and its persisted response state."
        breadcrumb={<Link to="/admin/client-responses">Back to Client responses</Link>}
        metadata={
          <StatusBadge tone={presentation.tone} label={presentation.label} />
        }
        actions={
          pendingDecision ? (
            <>
              <Button onClick={() => setSelected({ decision: "approve", task })}>
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  setSelected({ decision: "request_changes", task })
                }
              >
                Reject
              </Button>
            </>
          ) : undefined
        }
        headingRef={headingRef}
        headingTabIndex={-1}
      />

      <Surface as="section" className="client-response-detail__summary" aria-label="Response task summary">
        <dl>
          <div><dt>Project</dt><dd>{task.project?.name ?? "Project unavailable"}</dd></div>
          <div><dt>Client email</dt><dd>{task.client.email}</dd></div>
          <div><dt>Assigned Admin</dt><dd>{task.assignedAdmin.name}</dd></div>
          <div>
            <dt>Delivery status</dt>
            <dd><StatusBadge tone={delivery.tone} label={delivery.label} /></dd>
          </div>
          <div><dt>Delivery attempts</dt><dd>{task.deliveryAttemptCount}</dd></div>
          <div>
            <dt>Last delivery attempt</dt>
            <dd>
              {task.deliveryAttemptedAt ? (
                <time dateTime={task.deliveryAttemptedAt}>
                  {dateTime.format(new Date(task.deliveryAttemptedAt))}
                </time>
              ) : "Not attempted"}
            </dd>
          </div>
          <div>
            <dt>Delivered</dt>
            <dd>
              {task.deliveryStatus === "sent" && task.deliveredAt ? (
                <time dateTime={task.deliveredAt}>
                  {dateTime.format(new Date(task.deliveredAt))}
                </time>
              ) : "Not delivered"}
            </dd>
          </div>
          <div><dt>Decision source</dt><dd>{decisionSourceLabel(task.decisionSource)}</dd></div>
          {task.status !== "pending" ? (
            <div>
              <dt>Decided</dt>
              <dd>
                {task.decidedAt ? (
                  <time dateTime={task.decidedAt}>
                    {dateTime.format(new Date(task.decidedAt))}
                  </time>
                ) : "Time unavailable"}
              </dd>
            </div>
          ) : null}
        </dl>
        {task.decisionNote ? (
          <p className="client-response-detail__decision-note">
            {task.decisionNote}
          </p>
        ) : null}
      </Surface>

      <Surface
        as="section"
        className="client-response-detail__snapshot"
        aria-label="Immutable estimate snapshot"
      >
        <header>
          <div>
            <p className="eyebrow">Immutable Estimate version {task.estimate.version}</p>
            <h2>{task.estimateSnapshot.projectName}</h2>
            <p>
              {task.estimateSnapshot.location} · {task.estimateSnapshot.propertyType}
            </p>
          </div>
          <div className="client-response-detail__downloads">
            <span>{task.pdf.filename}</span>
            <DownloadButton
              label="Download exact estimate PDF"
              loadingLabel="Downloading exact estimate PDF…"
              errorMessage="This task's exact estimate PDF could not be downloaded."
              fallbackFilename={task.pdf.filename}
              getFile={() => downloadEstimateClientResponsePdf(task.id)}
            />
            {task.proofAvailable && canReadProof ? (
              <DownloadButton
                label="Download decision proof"
                loadingLabel="Downloading decision proof…"
                errorMessage="This task's decision proof could not be downloaded."
                fallbackFilename={`client-response-proof-${task.id}`}
                getFile={() => downloadEstimateClientResponseProof(task.id)}
              />
            ) : null}
          </div>
        </header>

        <div
          className="client-response-detail__table-scroll"
          role="region"
          aria-label="Estimate line items table"
          tabIndex={0}
        >
          <table className="client-response-detail__line-items">
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Item</th>
                <th scope="col">Specification</th>
                <th scope="col">Quantity</th>
                <th scope="col">Rate</th>
                <th scope="col">Amount</th>
                <th scope="col">Included</th>
              </tr>
            </thead>
            <tbody>
              {task.estimateSnapshot.lineItems.map((item, index) => (
                <tr key={`${item.catalogueId}-${item.roomName}-${index}`}>
                  <td>{item.roomName}</td>
                  <td>{item.catalogueId}</td>
                  <td>{item.specification}</td>
                  <td>{item.quantity} {item.unit}</td>
                  <td>{money.format(item.rate)}</td>
                  <td>{money.format(item.amount)}</td>
                  <td>{item.included ? "Included" : "Not included"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="client-response-detail__totals">
          <div><dt>Subtotal</dt><dd>{money.format(task.estimateSnapshot.subtotal)}</dd></div>
          <div><dt>GST</dt><dd>{money.format(task.estimateSnapshot.gst)}</dd></div>
          <div className="client-response-detail__total"><dt>Total</dt><dd>{money.format(task.estimateSnapshot.total)}</dd></div>
        </dl>
      </Surface>

      {selected ? (
        <ClientResponseDecisionDialog
          task={selected.task}
          decision={selected.decision}
          isCurrentRow={selectedTaskIsCurrent}
          onSaved={() => undefined}
          onClose={() => setSelected(null)}
          returnFocusRef={headingRef}
        />
      ) : null}
    </section>
  );
}
