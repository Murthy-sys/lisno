import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/client";
import type { FinanceLedgerEntry, ProjectFinanceBucket } from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { PageState } from "../../components/ui/PageState";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";
import { SupportingDocumentActions } from "../procurement/SupportingDocumentActions";
import { formatBps, formatPaise, formatPercentage } from "./financeFormat";
import { ProjectFinanceChart } from "./ProjectFinanceChart";
import {
  getFinanceSupportingDocument,
  getProjectFinanceBucket,
  getProjectFinanceEntries,
  postProjectFinanceEntry,
  projectFinanceKeys
} from "./projectFinanceApi";

/* Re-exported so the procurement views keep one money formatter. */
export { formatBps, formatPaise } from "./financeFormat";

const date = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC"
});

export function ProjectFinancePanel({
  projectId,
  enabled = true,
  title = "Finance bucket",
  expectedSource
}: {
  projectId: string;
  enabled?: boolean;
  title?: string;
  expectedSource?: ProjectFinanceExpectedSource | null;
}) {
  const auth = useAuth();
  const canCreate = hasFrontendPermission(auth.authorization, "finance.entry.create");
  const canReadDocuments = hasFrontendPermission(auth.authorization, "finance.entry.read");
  const queryEnabled = enabled && expectedSource !== null;
  const bucket = useQuery({
    queryKey: projectFinanceKeys.bucket(projectId),
    queryFn: () => getProjectFinanceBucket(projectId),
    enabled: queryEnabled
  });
  const entries = useInfiniteQuery({
    queryKey: projectFinanceKeys.entries(projectId),
    queryFn: ({ pageParam }) => getProjectFinanceEntries(projectId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore
      ? lastPage.pagination.offset + lastPage.pagination.limit
      : undefined,
    enabled: queryEnabled
  });
  const entryPages = entries.data?.pages ?? [];
  const entryItems = uniqueFinanceEntries(
    entryPages.flatMap((page) => page.items)
  );
  const entryTotal = entryPages[0]?.pagination.total ?? entryItems.length;
  const integrityError = bucket.data && expectedSource !== null
    ? projectFinanceIntegrityError(bucket.data, projectId, expectedSource)
    : null;
  const trustedBucket = bucket.data && integrityError === null
    ? bucket.data
    : null;
  const ledgerIntegrityError = trustedBucket && entries.data
    ? projectFinanceLedgerIntegrityError(
        entryItems,
        projectId,
        trustedBucket.id
      )
    : null;
  const heading = expectedSource
    ? `${expectedSource.projectName} finance`
    : trustedBucket
      ? `${trustedBucket.projectName} finance`
      : title;

  return (
    <Surface
      as="section"
      className="project-finance-panel"
      aria-labelledby={`project-finance-${projectId}`}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project financial details</p>
          <h2 id={`project-finance-${projectId}`}>{heading}</h2>
        </div>
        {trustedBucket ? (
          <StatusBadge
            tone={trustedBucket.overBudget ? "danger" : trustedBucket.status === "open" ? "success" : "info"}
            label={trustedBucket.overBudget ? "Over cost budget" : trustedBucket.status.replaceAll("_", " ")}
          />
        ) : null}
      </div>

      {!enabled ? (
        <p>The approved financial baseline becomes available after the Client approves the estimate.</p>
      ) : expectedSource === null ? (
        <PageState
          state="error"
          message="The approved Estimate baseline is missing, so this project's financial details cannot be reconciled safely."
        />
      ) : bucket.isPending ? (
        <PageState state="loading" message="Loading project finance…" />
      ) : bucket.isError ? (
        <PageState
          state="error"
          message={financeError(bucket.error)}
          action={{
            label: "Try again",
            onAction: () => void bucket.refetch()
          }}
        />
      ) : integrityError ? (
        <PageState
          state="error"
          message={integrityError}
          action={{
            label: "Refresh financial details",
            onAction: () => void Promise.all([bucket.refetch(), entries.refetch()])
          }}
        />
      ) : trustedBucket ? (
        <>
          <ProjectFinanceChart bucket={trustedBucket} />
          <div className="project-finance-panel__details">
            <dl>
              <div><dt>Client-approved value (incl. GST)</dt><dd>{formatPaise(trustedBucket.approvedContractTotalPaise)}</dd></div>
              <div><dt>GST included (18%)</dt><dd>{formatPaise(trustedBucket.approvedGstPaise)}</dd></div>
              <div><dt>Net approved revenue (excl. GST)</dt><dd>{formatPaise(trustedBucket.approvedSubtotalPaise)}</dd></div>
              <div><dt>Profit margin policy</dt><dd>{formatBps(trustedBucket.targetMarginBps)}</dd></div>
              <div><dt>Cost budget consumed</dt><dd>{formatPercentage(trustedBucket.recordedCostPaise, trustedBucket.costBudgetPaise)}</dd></div>
              <div><dt>Approved estimate baseline</dt><dd>Version {trustedBucket.estimateVersion}</dd></div>
              <div><dt>Design plan baseline</dt><dd>Version {trustedBucket.designPlanVersion}</dd></div>
              <div><dt>Project deadline</dt><dd>{date.format(new Date(trustedBucket.deadlineAt))}</dd></div>
              <div><dt>Schedule position</dt><dd>{deadlineLabel(trustedBucket)}</dd></div>
            </dl>
          </div>
          {canCreate && trustedBucket.status === "open" && entries.data && !ledgerIntegrityError ? (
            <FinanceEntryForm key={projectId} projectId={projectId} />
          ) : null}
          {entries.isPending ? (
            <PageState state="loading" message="Loading spending and overhead ledger…" />
          ) : entries.isError && !entries.data ? (
            <PageState
              state="error"
              message="The spending and overhead ledger could not be loaded. The approved financial baseline remains available above."
              action={{ label: "Retry ledger", onAction: () => void entries.refetch() }}
            />
          ) : ledgerIntegrityError ? (
            <PageState
              state="error"
              message={ledgerIntegrityError}
              action={{ label: "Refresh ledger", onAction: () => void entries.refetch() }}
            />
          ) : (
            <FinanceEntries
              projectId={projectId}
              entries={entryItems}
              total={entryTotal}
              canReadDocuments={canReadDocuments}
              hasMore={entries.hasNextPage}
              loadingMore={entries.isFetchingNextPage}
              loadMoreError={entries.isFetchNextPageError}
              onLoadMore={() => void entries.fetchNextPage()}
            />
          )}
        </>
      ) : null}
    </Surface>
  );
}

export interface ProjectFinanceExpectedSource {
  projectId: string;
  projectName: string;
  estimateId: string;
  estimateVersion?: number;
  approvedSubtotalPaise: number;
  approvedGstPaise: number;
  approvedContractTotalPaise: number;
}

const FINANCE_INTEGRITY_MESSAGE =
  "These financial details do not match this project's approved estimate. Refresh the project before taking financial action.";

function projectFinanceIntegrityError(
  bucket: ProjectFinanceBucket,
  requestedProjectId: string,
  expected?: ProjectFinanceExpectedSource
): string | null {
  const nonNegativeAmounts = [
    bucket.approvedSubtotalPaise,
    bucket.approvedGstPaise,
    bucket.approvedContractTotalPaise,
    bucket.targetProfitPaise,
    bucket.costBudgetPaise,
    bucket.procurementCostPaise,
    bucket.employeePaymentPaise,
    bucket.otherExpensePaise,
    bucket.directSpendPaise,
    bucket.overheadPaise,
    bucket.recordedCostPaise
  ];
  const approvedSubtotalIsSafe = Number.isSafeInteger(bucket.approvedSubtotalPaise) &&
    bucket.approvedSubtotalPaise >= 0;
  const expectedTargetProfitPaise = approvedSubtotalIsSafe
    ? Number((BigInt(bucket.approvedSubtotalPaise) * 2_000n + 5_000n) / 10_000n)
    : null;
  const sourceMismatch = bucket.projectId !== requestedProjectId || (
    expected !== undefined && (
      expected.projectId !== requestedProjectId ||
      bucket.estimateId !== expected.estimateId ||
      (expected.estimateVersion !== undefined &&
        bucket.estimateVersion !== expected.estimateVersion) ||
      bucket.approvedSubtotalPaise !== expected.approvedSubtotalPaise ||
      bucket.approvedGstPaise !== expected.approvedGstPaise ||
      bucket.approvedContractTotalPaise !== expected.approvedContractTotalPaise
    )
  );
  const arithmeticMismatch =
    nonNegativeAmounts.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    bucket.targetMarginBps !== 2_000 ||
    expectedTargetProfitPaise === null ||
    bucket.targetProfitPaise !== expectedTargetProfitPaise ||
    bucket.approvedSubtotalPaise + bucket.approvedGstPaise !==
      bucket.approvedContractTotalPaise ||
    bucket.targetProfitPaise + bucket.costBudgetPaise !==
      bucket.approvedSubtotalPaise ||
    bucket.procurementCostPaise + bucket.employeePaymentPaise +
      bucket.otherExpensePaise !== bucket.directSpendPaise ||
    bucket.directSpendPaise + bucket.overheadPaise !== bucket.recordedCostPaise ||
    bucket.costBudgetPaise - bucket.recordedCostPaise !== bucket.remainingBudgetPaise ||
    bucket.approvedSubtotalPaise - bucket.recordedCostPaise !==
      bucket.currentProfitPaise ||
    bucket.overBudget !== (bucket.remainingBudgetPaise < 0);
  return sourceMismatch || arithmeticMismatch
    ? FINANCE_INTEGRITY_MESSAGE
    : null;
}

function projectFinanceLedgerIntegrityError(
  entries: FinanceLedgerEntry[],
  requestedProjectId: string,
  bucketId: string
): string | null {
  return entries.some(
    (entry) => entry.projectId !== requestedProjectId || entry.bucketId !== bucketId
  )
    ? "The spending ledger contains entries from a different project or financial baseline. Refresh the project before taking financial action."
    : null;
}

function uniqueFinanceEntries(entries: FinanceLedgerEntry[]) {
  const unique = new Map<string, FinanceLedgerEntry>();
  for (const entry of entries) unique.set(entry.id, entry);
  return [...unique.values()];
}

function FinanceEntryForm({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const idempotencyKey = useRef(financeRequestKey());
  const [type, setType] = useState<"direct_spend" | "overhead">("direct_spend");
  const [expenseClass, setExpenseClass] = useState<"employee_payment" | "other">("employee_payment");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof postProjectFinanceEntry>[1]) =>
      postProjectFinanceEntry(projectId, input),
    onSuccess: async () => {
      idempotencyKey.current = financeRequestKey();
      setCategory("");
      setAmount("");
      setDescription("");
      setVendor("");
      setReference("");
      await Promise.all([
        client.invalidateQueries({ queryKey: projectFinanceKeys.bucket(projectId) }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.entries(projectId) }),
        client.invalidateQueries({ queryKey: projectFinanceKeys.projects })
      ]);
    }
  });
  const updateDraft = (update: () => void) => {
    update();
    idempotencyKey.current = financeRequestKey();
    setValidation("");
    if (!mutation.isPending) mutation.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rupees = Number(amount);
    if (!category.trim() || !description.trim() || !Number.isFinite(rupees) || rupees <= 0) {
      setValidation("Enter a category, description, and positive amount.");
      return;
    }
    const amountPaise = Math.round(rupees * 100);
    if (!Number.isSafeInteger(amountPaise)) {
      setValidation("The amount is too large.");
      return;
    }
    setValidation("");
    const entry = {
      category: category.trim(),
      amountPaise,
      incurredAt: `${incurredAt}T00:00:00.000Z`,
      description: description.trim(),
      ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      idempotencyKey: idempotencyKey.current
    };
    mutation.mutate(type === "direct_spend"
      ? { ...entry, type, expenseClass }
      : { ...entry, type });
  };

  return (
    <form className="finance-entry-form" onSubmit={submit} noValidate>
      <div className="section-heading">
        <div><h3>Record project cost</h3><p>Posted entries remain in the financial ledger.</p></div>
      </div>
      <div className="finance-entry-form__grid">
        <Field id={`finance-entry-type-${projectId}`} label="Cost type" required>
          {(props) => <Select {...props} value={type} onChange={(event) => updateDraft(() => setType(event.target.value as typeof type))}><option value="direct_spend">Direct spending</option><option value="overhead">Overhead</option></Select>}
        </Field>
        {type === "direct_spend" ? (
          <Field id={`finance-entry-class-${projectId}`} label="Expense class" hint="Used for accurate portfolio reporting." required>
            {(props) => <Select {...props} value={expenseClass} onChange={(event) => updateDraft(() => setExpenseClass(event.target.value as typeof expenseClass))}><option value="employee_payment">Employee payment</option><option value="other">Other project expense</option></Select>}
          </Field>
        ) : null}
        <Field id={`finance-entry-category-${projectId}`} label="Category" required>
          {(props) => <Input {...props} value={category} onChange={(event) => updateDraft(() => setCategory(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-amount-${projectId}`} label="Amount (INR)" required>
          {(props) => <Input {...props} type="number" min="0.01" step="0.01" value={amount} onChange={(event) => updateDraft(() => setAmount(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-date-${projectId}`} label="Incurred date" required>
          {(props) => <Input {...props} type="date" value={incurredAt} onChange={(event) => updateDraft(() => setIncurredAt(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-vendor-${projectId}`} label="Vendor / payee">
          {(props) => <Input {...props} value={vendor} onChange={(event) => updateDraft(() => setVendor(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-reference-${projectId}`} label="Invoice / reference">
          {(props) => <Input {...props} value={reference} onChange={(event) => updateDraft(() => setReference(event.target.value))} />}
        </Field>
        <Field id={`finance-entry-description-${projectId}`} className="finance-entry-form__description" label="Description" required>
          {(props) => <Textarea {...props} rows={3} value={description} onChange={(event) => updateDraft(() => setDescription(event.target.value))} />}
        </Field>
      </div>
      {validation || mutation.isError ? <p role="alert">{validation || financeError(mutation.error)}</p> : null}
      {mutation.isSuccess ? <p role="status">Project cost recorded.</p> : null}
      <Button type="submit" busy={mutation.isPending} busyLabel="Recording…">Record cost</Button>
    </form>
  );
}

function FinanceEntries({
  projectId,
  entries,
  total,
  canReadDocuments,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore
}: {
  projectId: string;
  entries: FinanceLedgerEntry[];
  total: number;
  canReadDocuments: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="finance-entries" aria-labelledby="finance-entries-title">
      <div className="section-heading"><div><h3 id="finance-entries-title">Spending and overhead ledger</h3></div><span>{hasMore ? `${entries.length} of ${total} entries` : `${entries.length} entries`}</span></div>
      {entries.length === 0 ? <p className="inline-empty">No project costs have been recorded.</p> : (
        <>
          <div className="finance-entries__list">
            {entries.map((entry) => (
              <article key={entry.id} className="finance-entry">
                <div><strong>{entry.category}</strong><span>{financeEntryLabel(entry)} · {date.format(new Date(entry.incurredAt))}</span></div>
                <strong>{formatPaise(entry.amountPaise)}</strong>
                <p>{entry.description}</p>
                {entry.vendor || entry.reference ? <small>{[entry.vendor, entry.reference].filter(Boolean).join(" · ")}</small> : null}
                {/*
                  Lineage identifiers stay in the payload for reconciliation;
                  only the approved names the server resolves are shown here.
                */}
                {entry.sourceSectionId || entry.sourceLineItemKey ? (
                  <dl className="finance-entry__lineage" aria-label="Approved Estimate source">
                    {entry.sourceSectionLabel ? <div><dt>Estimate section</dt><dd>{entry.sourceSectionLabel}</dd></div> : null}
                    {entry.sourceLineItemKey ? (
                      <div>
                        <dt>Estimate item</dt>
                        <dd>{entry.sourceLineItemLabel ?? "No longer in the approved Estimate"}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {canReadDocuments ? (
                  <SupportingDocumentActions
                    supportingDocument={entry.supportingDocument}
                    getFile={() => getFinanceSupportingDocument(projectId, entry.id)}
                  />
                ) : entry.supportingDocument ? (
                  <span className="supporting-document supporting-document--restricted">Supporting document access restricted</span>
                ) : (
                  <span className="supporting-document supporting-document--missing">No supporting document</span>
                )}
              </article>
            ))}
          </div>
          {loadingMore ? <p role="status">Loading more ledger entries…</p> : null}
          {loadMoreError ? (
            <div>
              <p role="alert">More ledger entries could not be loaded.</p>
              <Button variant="secondary" onClick={onLoadMore}>Retry loading more entries</Button>
            </div>
          ) : hasMore ? (
            <Button
              variant="secondary"
              busy={loadingMore}
              busyLabel="Loading more entries…"
              onClick={onLoadMore}
            >
              Load more ledger entries
            </Button>
          ) : (
            <p role="status">All available ledger entries loaded.</p>
          )}
        </>
      )}
    </section>
  );
}

function financeEntryLabel(entry: { type: "direct_spend" | "overhead"; expenseClass: "procurement" | "employee_payment" | "other" | null }) {
  if (entry.type === "overhead") return "Overhead";
  if (entry.expenseClass === "procurement") return "Procurement cost";
  if (entry.expenseClass === "employee_payment") return "Employee payment";
  return "Other project expense";
}

function deadlineLabel(bucket: Pick<ProjectFinanceBucket, "deadlineStatus" | "overdueDays" | "overdueTaskCount">) {
  switch (bucket.deadlineStatus) {
    case "overdue":
      return `${bucket.overdueDays} days late · ${bucket.overdueTaskCount} overdue ${bucket.overdueTaskCount === 1 ? "task" : "tasks"}`;
    case "completed_late":
      return "Completed after deadline";
    case "completed_on_time":
      return "Completed on time";
    case "completed_date_unknown":
      return "Completion date unavailable";
    case "on_track":
      return bucket.overdueTaskCount > 0
        ? `On track · ${bucket.overdueTaskCount} overdue ${bucket.overdueTaskCount === 1 ? "task" : "tasks"}`
        : "On track";
  }
}

function financeError(error: unknown) {
  return error instanceof ApiError ? error.message : "Project finance could not be loaded.";
}

function financeRequestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `finance-${Date.now()}-${Math.random()}`;
}
