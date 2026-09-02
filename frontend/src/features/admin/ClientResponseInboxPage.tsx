import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../../api/client";
import type {
  EstimateClientResponseTaskListItem,
  PaginationInput
} from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge, type StatusTone } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { ClientResponseDecisionDialog } from "./ClientResponseDecisionDialog";
import {
  estimateClientResponseKeys,
  getEstimateClientResponses,
  type EstimateClientResponseStatus
} from "./estimateClientResponsesApi";

const PAGE_SIZE = 20;
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC"
});

const filters: Array<{
  label: string;
  status: EstimateClientResponseStatus | undefined;
}> = [
  { label: "Pending", status: "pending" },
  { label: "Approved history", status: "approved" },
  { label: "Changes requested history", status: "changes_requested" },
  { label: "All", status: undefined }
];

const statusPresentation: Record<
  EstimateClientResponseTaskListItem["status"],
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes requested", tone: "danger" }
};

function deliveryLabel(
  status: EstimateClientResponseTaskListItem["deliveryStatus"]
): string {
  if (status === "sent") return "Email sent";
  if (status === "failed") return "Email delivery failed";
  if (status === "disabled") return "Email unavailable";
  return "Email queued";
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "We couldn't load Client responses.";
}

function emptyMessage(status: EstimateClientResponseStatus | undefined) {
  if (status === "pending") {
    return "There are no pending Client responses assigned to you.";
  }
  if (status === "approved") return "There are no approved Client responses.";
  if (status === "changes_requested") {
    return "There are no changes-requested Client responses.";
  }
  return "There are no Client response tasks to show.";
}

type SelectedDecision = {
  task: EstimateClientResponseTaskListItem;
  decision: "approve" | "request_changes";
};

export function ClientResponseInboxPage() {
  const auth = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState<
    EstimateClientResponseStatus | undefined
  >("pending");
  const [pagination, setPagination] = useState<PaginationInput>({
    limit: PAGE_SIZE,
    offset: 0
  });
  const [correctionTargetOffset, setCorrectionTargetOffset] = useState<
    number | null
  >(null);
  const [selected, setSelected] = useState<SelectedDecision | null>(null);
  const taskQuery = useQuery({
    queryKey: estimateClientResponseKeys.list(status, pagination),
    queryFn: () => getEstimateClientResponses(status, pagination),
    placeholderData: keepPreviousData
  });
  const page = taskQuery.data;
  const currentTask = page?.items.find(
    (item) => item.id === selected?.task.id
  );
  const selectionIsCurrent = Boolean(
    currentTask?.status === "pending" &&
      currentTask.version === selected?.task.version
  );
  const paginationIsLocked =
    taskQuery.isFetching || taskQuery.isPlaceholderData;
  const hasCanonicalEmptyLaterPage = Boolean(
    !taskQuery.isError &&
      page &&
      !taskQuery.isPlaceholderData &&
      page.items.length === 0 &&
      page.pagination.offset > 0
  );
  const isCorrectingEmptyPage =
    hasCanonicalEmptyLaterPage || correctionTargetOffset !== null;
  const canDecide = hasFrontendPermission(
    auth.authorization,
    "estimation.client_response_tasks.decide"
  );

  useEffect(() => {
    if (!page || !hasCanonicalEmptyLaterPage) {
      return;
    }

    const pageSize = Math.max(1, page.pagination.limit);
    const previousOffset = Math.max(0, page.pagination.offset - pageSize);
    const lastOffset =
      page.pagination.total > 0
        ? Math.floor((page.pagination.total - 1) / pageSize) * pageSize
        : 0;
    const validOffset = Math.min(previousOffset, lastOffset);

    setCorrectionTargetOffset(validOffset);
    setPagination((current) =>
      current.offset === page.pagination.offset && current.offset !== validOffset
        ? { ...current, offset: validOffset }
        : current
    );
  }, [hasCanonicalEmptyLaterPage, page]);

  useEffect(() => {
    if (
      correctionTargetOffset === null ||
      pagination.offset !== correctionTargetOffset ||
      taskQuery.isPlaceholderData ||
      taskQuery.isFetching ||
      hasCanonicalEmptyLaterPage
    ) {
      return;
    }

    setCorrectionTargetOffset(null);
  }, [
    correctionTargetOffset,
    hasCanonicalEmptyLaterPage,
    pagination.offset,
    taskQuery.isFetching,
    taskQuery.isPlaceholderData
  ]);

  const selectFilter = (
    nextStatus: EstimateClientResponseStatus | undefined
  ) => {
    setCorrectionTargetOffset(null);
    setStatus(nextStatus);
    setPagination({ limit: PAGE_SIZE, offset: 0 });
  };

  return (
    <section
      className="client-responses client-responses--inbox"
      aria-labelledby="client-response-inbox-title"
      aria-busy={
        !taskQuery.isError &&
        (taskQuery.isPending || taskQuery.isFetching || isCorrectingEmptyPage)
      }
    >
      <PageHeader
        id="client-response-inbox-title"
        eyebrow="Estimate administration"
        title="Client responses"
        description="Review only the response tasks assigned to your server-scoped project access."
        headingRef={headingRef}
        headingTabIndex={-1}
      />

      <nav className="client-responses__filters ui-tab-nav" aria-label="Client response filters">
        {filters.map((filter) => (
          <Button
            key={filter.label}
            className="ui-tab-nav__item"
            size="compact"
            variant={status === filter.status ? "primary" : "quiet"}
            aria-pressed={status === filter.status}
            onClick={() => selectFilter(filter.status)}
          >
            {filter.label}
          </Button>
        ))}
      </nav>

      {taskQuery.isPending ? (
        <PageState state="loading" message="Loading client responses…" />
      ) : taskQuery.isError ? (
        <PageState
          state="error"
          message={errorMessage(taskQuery.error)}
          action={{
            label: "Try again",
            onAction: () => void taskQuery.refetch()
          }}
        />
      ) : isCorrectingEmptyPage ? (
        <PageState
          state="loading"
          message="Loading previous Client responses…"
        />
      ) : !page || page.items.length === 0 ? (
        <PageState state="empty" message={emptyMessage(status)} />
      ) : (
        <Surface
          as="section"
          padding="compact"
          className="client-responses__directory"
          aria-label="Client response inbox"
        >
          <div
            className="client-responses__table-scroll"
            role="region"
            aria-label="Client response tasks table"
            tabIndex={0}
          >
            <table
              className="client-responses__table"
              aria-label="Client response tasks"
            >
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Project</th>
                  <th scope="col">Estimate</th>
                  <th scope="col">Task state</th>
                  <th scope="col">Delivery</th>
                  <th scope="col">Created</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((task) => {
                  const presentation = statusPresentation[task.status];
                  return (
                    <tr key={task.id}>
                      <td>
                        <span className="client-responses__identity">
                          <strong>{task.client.name}</strong>
                          <span>{task.client.email}</span>
                        </span>
                      </td>
                      <td>{task.project?.name ?? "Project unavailable"}</td>
                      <td>
                        <span className="client-responses__identity">
                          <strong>Version {task.estimate.version}</strong>
                          <span>{new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: "INR",
                            maximumFractionDigits: 0
                          }).format(task.estimate.total)}</span>
                        </span>
                      </td>
                      <td>
                        <StatusBadge
                          tone={presentation.tone}
                          label={presentation.label}
                        />
                      </td>
                      <td>{deliveryLabel(task.deliveryStatus)}</td>
                      <td>
                        <time dateTime={task.createdAt}>
                          {dateTime.format(new Date(task.createdAt))}
                        </time>
                      </td>
                      <td>
                        <div className="client-responses__row-actions">
                          <Link
                            className="ui-button ui-button--secondary ui-button--compact"
                            to={`/admin/client-responses/${encodeURIComponent(task.id)}`}
                          >
                            Review <span className="sr-only">{task.client.name} response</span>
                          </Link>
                          {task.status === "pending" && canDecide ? (
                            <>
                              <Button
                                size="compact"
                                onClick={() =>
                                  setSelected({ task, decision: "approve" })
                                }
                              >
                                Approve <span className="sr-only">{task.client.name} response</span>
                              </Button>
                              <Button
                                size="compact"
                                variant="quiet"
                                onClick={() =>
                                  setSelected({
                                    task,
                                    decision: "request_changes"
                                  })
                                }
                              >
                                Reject <span className="sr-only">{task.client.name} response</span>
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className="client-responses__pagination" aria-label="Client response pages">
            <p aria-live="polite">
              Showing {page.pagination.offset + 1}–
              {Math.min(
                page.pagination.offset + page.items.length,
                page.pagination.total
              )} of {page.pagination.total}
            </p>
            <div>
              <Button
                size="compact"
                variant="quiet"
                disabled={paginationIsLocked || pagination.offset === 0}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    offset: Math.max(0, current.offset - current.limit)
                  }))
                }
              >
                Previous page
              </Button>
              <Button
                size="compact"
                variant="secondary"
                disabled={paginationIsLocked || !page.pagination.hasMore}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    offset: current.offset + current.limit
                  }))
                }
              >
                Next page
              </Button>
            </div>
          </nav>
        </Surface>
      )}

      {selected ? (
        <ClientResponseDecisionDialog
          task={selected.task}
          decision={selected.decision}
          isCurrentRow={selectionIsCurrent}
          onSaved={() => undefined}
          onClose={() => setSelected(null)}
          returnFocusRef={headingRef}
        />
      ) : null}
    </section>
  );
}
