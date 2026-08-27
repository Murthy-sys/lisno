import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, ReceiptText, ShoppingCart } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import type {
  ProcurementEstimateItem,
  ProcurementEstimateSection,
  ProcurementProject
} from "../../api/types";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, FileInput, Input, Textarea } from "../../components/ui/Field";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { adminProjectKeys } from "../admin/adminProjectsApi";
import { formatPaise } from "../finance/ProjectFinancePanel";
import { projectFinanceKeys } from "../finance/projectFinanceApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { SupportingDocumentActions } from "./SupportingDocumentActions";
import {
  getProcurementSupportingDocument,
  postProcurementExpense,
  procurementKeys
} from "./procurementApi";
import {
  RECEIPT_ACCEPT,
  formatBytes,
  procurementError,
  procurementProjectActualTotal,
  procurementProjectEstimatedTotal,
  procurementReceiptError,
  procurementRequestKey,
  purchaseDate,
  quantity,
  rupeesToPaise,
  useProcurementProjects
} from "./procurementPresentation";

interface PurchaseSelection {
  project: ProcurementProject;
  section: ProcurementEstimateSection;
  item: ProcurementEstimateItem;
}

export function ProcurementProjectPage() {
  const { projectId = "" } = useParams();
  const auth = useAuth();
  const canRead = hasFrontendPermission(
    auth.authorization,
    "procurement.workspace.read"
  );
  const canCreate = hasFrontendPermission(
    auth.authorization,
    "procurement.expense.create"
  );
  const canReadDocuments = hasFrontendPermission(
    auth.authorization,
    "procurement.document.read"
  );
  const [selection, setSelection] = useState<PurchaseSelection | null>(null);
  const { query, integrityError, projects } = useProcurementProjects(canRead);
  const project = projects?.find(
    (candidate) => candidate.projectId === projectId
  ) ?? null;

  return (
    <section
      className="procurement-project-page"
      aria-labelledby="procurement-project-page-title"
    >
      <PageHeader
        id="procurement-project-page-title"
        eyebrow="Approved Estimate purchasing"
        title={project?.projectName ?? "Procurement purchases"}
        description="Record actual costs and receipts against each approved Estimate item."
        breadcrumb={<Link to="/home">Back to approved projects</Link>}
      />

      {!canRead ? (
        <PageState
          state="error"
          message="You do not have permission to view the procurement workspace."
        />
      ) : query.isPending ? (
        <PageState state="loading" message="Loading approved Estimate items…" />
      ) : query.isError ? (
        <PageState
          state="error"
          message={procurementError(query.error, "Procurement projects could not be loaded.")}
          action={{ label: "Try again", onAction: () => void query.refetch() }}
        />
      ) : integrityError ? (
        <PageState
          state="error"
          message={integrityError}
          action={{ label: "Refresh procurement", onAction: () => void query.refetch() }}
        />
      ) : !project ? (
        <PageState
          state="empty"
          message="This project is not available for procurement. It may not be Design approved yet."
        />
      ) : (
        <ProcurementProjectDetail
          project={project}
          canCreate={canCreate}
          canReadDocuments={canReadDocuments}
          onRecord={(section, item) => setSelection({ project, section, item })}
        />
      )}

      {selection ? (
        <PurchaseDialog
          key={`${selection.project.projectId}:${selection.item.key}`}
          selection={selection}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </section>
  );
}

function ProcurementProjectDetail({
  project,
  canCreate,
  canReadDocuments,
  onRecord
}: {
  project: ProcurementProject;
  canCreate: boolean;
  canReadDocuments: boolean;
  onRecord: (section: ProcurementEstimateSection, item: ProcurementEstimateItem) => void;
}) {
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set()
  );
  const estimatedTotal = procurementProjectEstimatedTotal(project);
  const actualTotal = procurementProjectActualTotal(project);

  const toggleSection = (sectionId: string) => {
    setExpandedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <article
      className="procurement-project"
      aria-label={`${project.projectName} procurement detail`}
    >
      <header className="procurement-project__header">
        <div>
          <p className="eyebrow">Estimate v{project.estimateVersion}</p>
          <p>{project.sections.length} selected Estimate {project.sections.length === 1 ? "section" : "sections"}</p>
        </div>
        <StatusBadge tone="success" label="Design approved" />
      </header>
      <dl className="procurement-project__totals" aria-label={`${project.projectName} procurement totals`}>
        <div><dt>Selected estimate value</dt><dd>{formatPaise(estimatedTotal)}</dd></div>
        <div><dt>Recorded spend</dt><dd>{formatPaise(actualTotal)}</dd></div>
        <div><dt>Remaining selected value</dt><dd>{formatPaise(estimatedTotal - actualTotal)}</dd></div>
      </dl>
      {project.sections.length === 0 ? (
        <p className="inline-empty">This approved Estimate has no non-zero selected items to procure.</p>
      ) : (
        <div className="procurement-section-list">
          {project.sections.map((section) => {
            const expanded = expandedSectionIds.has(section.id);
            const triggerId = `procurement-section-${project.projectId}-${section.id}-trigger`;
            const panelId = `procurement-section-${project.projectId}-${section.id}-panel`;
            return (
              <div
                className="procurement-section"
                key={section.id}
              >
                <h2 className="procurement-section__heading">
                  <button
                    id={triggerId}
                    className="procurement-section__trigger"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span className="procurement-section__identity">
                      <span className="procurement-section__title">{section.label}</span>
                      <span>{section.items.length} {section.items.length === 1 ? "item" : "items"}</span>
                    </span>
                    <span className="procurement-section__metrics">
                      <span>
                        <span>Estimated</span>
                        <strong>{formatPaise(section.estimatedAmountPaise)}</strong>
                      </span>
                      <span>
                        <span>Spent</span>
                        <strong>{formatPaise(section.actualSpendPaise)}</strong>
                      </span>
                    </span>
                    <ChevronDown
                      className="procurement-section__chevron"
                      aria-hidden="true"
                    />
                  </button>
                </h2>
                {expanded ? (
                  <div
                    id={panelId}
                    className="procurement-section__panel"
                    role="region"
                    aria-labelledby={triggerId}
                  >
                    <div className="procurement-item-list">
                      {section.items.map((item) => (
                        <ProcurementItemCard
                          key={item.key}
                          project={project}
                          section={section}
                          item={item}
                          canCreate={canCreate}
                          canReadDocuments={canReadDocuments}
                          onRecord={() => onRecord(section, item)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function ProcurementItemCard({
  project,
  section,
  item,
  canCreate,
  canReadDocuments,
  onRecord
}: {
  project: ProcurementProject;
  section: ProcurementEstimateSection;
  item: ProcurementEstimateItem;
  canCreate: boolean;
  canReadDocuments: boolean;
  onRecord: () => void;
}) {
  return (
    <article
      className="procurement-item"
      aria-label={`${item.specification} in ${item.roomName}`}
    >
      <div className="procurement-item__summary">
        <div>
          <span className="procurement-item__room">{item.roomName}</span>
          <h3>{item.specification}</h3>
          <p>{quantity.format(item.quantity)} {item.unit} · Catalogue {item.catalogueId}</p>
        </div>
        <dl>
          <div><dt>Estimated</dt><dd>{formatPaise(item.estimatedAmountPaise)}</dd></div>
          <div><dt>Actual spend</dt><dd>{formatPaise(item.actualSpendPaise)}</dd></div>
        </dl>
      </div>
      <div className="procurement-item__purchases">
        <div className="procurement-item__purchases-heading">
          <strong>Recorded purchases</strong>
          <span>{item.expenses.length}</span>
        </div>
        {item.expenses.length === 0 ? (
          <p className="inline-empty">No purchases recorded for this item.</p>
        ) : (
          <ul aria-label={`Recorded purchases for ${item.specification}`}>
            {item.expenses.map((expense) => (
              <li key={expense.id}>
                <div className="procurement-purchase__summary">
                  <span><strong>{formatPaise(expense.amountPaise)}</strong> · {purchaseDate.format(new Date(expense.incurredAt))}</span>
                  <p>{expense.description}</p>
                  {expense.vendor || expense.reference ? (
                    <small>{[expense.vendor, expense.reference].filter(Boolean).join(" · ")}</small>
                  ) : null}
                </div>
                {canReadDocuments ? (
                  <SupportingDocumentActions
                    supportingDocument={expense.supportingDocument}
                    getFile={() => getProcurementSupportingDocument(project.projectId, expense.id)}
                  />
                ) : expense.supportingDocument ? (
                  <span className="supporting-document supporting-document--restricted">Supporting document access restricted</span>
                ) : (
                  <span className="supporting-document supporting-document--missing">No supporting document</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canCreate ? (
        <Button
          variant="secondary"
          size="compact"
          leadingIcon={<ShoppingCart />}
          onClick={onRecord}
          aria-label={`Record purchase for ${item.specification} in ${item.roomName}`}
        >
          Record purchase
        </Button>
      ) : null}
      <span className="sr-only">Estimate section {section.label}</span>
    </article>
  );
}

function PurchaseDialog({
  selection,
  onClose
}: {
  selection: PurchaseSelection;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const idPrefix = useId();
  const idempotencyKey = useRef(procurementRequestKey());
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [validation, setValidation] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: (amountPaise: number) => postProcurementExpense(
      selection.project.projectId,
      {
        sourceLineItemKey: selection.item.key,
        amountPaise,
        incurredAt: `${incurredAt}T00:00:00.000Z`,
        description: description.trim(),
        ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        idempotencyKey: idempotencyKey.current,
        receipt: receipt!
      },
      setUploadProgress
    ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: procurementKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectFinanceKeys.projects }),
        queryClient.invalidateQueries({
          queryKey: projectFinanceKeys.bucket(selection.project.projectId)
        }),
        queryClient.invalidateQueries({
          queryKey: projectFinanceKeys.entries(selection.project.projectId)
        }),
        queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
        queryClient.invalidateQueries({
          queryKey: adminProjectKeys.detail(selection.project.projectId)
        }),
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.operational }),
        queryClient.invalidateQueries({
          queryKey: projectWorkflowKeys.projectTasks(selection.project.projectId)
        })
      ]);
      feedback.success({
        title: result.replayed ? "Purchase already recorded" : "Purchase recorded",
        message: `${formatPaise(result.entry.amountPaise)} was added to ${selection.project.projectName} spending.`
      });
      onClose();
    }
  });

  const updateDraft = (change: () => void) => {
    change();
    idempotencyKey.current = procurementRequestKey();
    setValidation("");
    setUploadProgress(0);
    if (!mutation.isPending) mutation.reset();
  };

  const changeReceipt = (event: ChangeEvent<HTMLInputElement>) => {
    updateDraft(() => setReceipt(event.target.files?.[0] ?? null));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountPaise = rupeesToPaise(amount);
    if (amountPaise === null) {
      setValidation("Enter a positive INR amount with no more than two decimal places.");
      return;
    }
    if (!incurredAt) {
      setValidation("Choose the date when this purchase was incurred.");
      return;
    }
    if (!description.trim()) {
      setValidation("Enter a purchase description.");
      return;
    }
    const receiptError = procurementReceiptError(receipt);
    if (receiptError) {
      setValidation(receiptError);
      return;
    }
    setValidation("");
    setUploadProgress(0);
    mutation.mutate(amountPaise);
  };

  return (
    <Dialog
      title={`Record purchase for ${selection.item.specification}`}
      eyebrow={`${selection.project.projectName} · ${selection.section.label}`}
      description={`${selection.item.roomName} · ${quantity.format(selection.item.quantity)} ${selection.item.unit}`}
      onClose={onClose}
      busy={mutation.isPending}
    >
      <form className="modal-form procurement-purchase-form" onSubmit={submit} noValidate>
        <div className="procurement-purchase-form__context" aria-label="Selected Estimate item">
          <FileText aria-hidden="true" />
          <span>
            <small>Approved Estimate value</small>
            <strong>{formatPaise(selection.item.estimatedAmountPaise)}</strong>
          </span>
          <span>
            <small>Actual spend to date</small>
            <strong>{formatPaise(selection.item.actualSpendPaise)}</strong>
          </span>
        </div>
        <div className="procurement-purchase-form__grid">
          <Field id={`${idPrefix}-amount`} label="Actual price (INR)" required>
            {(props) => (
              <Input
                {...props}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(event) => updateDraft(() => setAmount(event.target.value))}
              />
            )}
          </Field>
          <Field id={`${idPrefix}-date`} label="Purchase date" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={incurredAt}
                onChange={(event) => updateDraft(() => setIncurredAt(event.target.value))}
              />
            )}
          </Field>
          <Field id={`${idPrefix}-vendor`} label="Vendor / payee">
            {(props) => (
              <Input
                {...props}
                value={vendor}
                onChange={(event) => updateDraft(() => setVendor(event.target.value))}
              />
            )}
          </Field>
          <Field id={`${idPrefix}-reference`} label="Invoice / reference">
            {(props) => (
              <Input
                {...props}
                value={reference}
                onChange={(event) => updateDraft(() => setReference(event.target.value))}
              />
            )}
          </Field>
          <Field
            id={`${idPrefix}-description`}
            className="procurement-purchase-form__wide"
            label="Description"
            required
          >
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={description}
                onChange={(event) => updateDraft(() => setDescription(event.target.value))}
              />
            )}
          </Field>
          <Field
            id={`${idPrefix}-receipt`}
            className="procurement-purchase-form__wide"
            label="Receipt or supporting document"
            hint="PDF, JPEG, PNG, or WebP. The server validates file contents and the configured upload limit."
            required
          >
            {(props) => (
              <FileInput
                {...props}
                accept={RECEIPT_ACCEPT}
                onChange={changeReceipt}
              />
            )}
          </Field>
        </div>
        {receipt ? (
          <p className="procurement-purchase-form__file">
            <ReceiptText aria-hidden="true" />
            <span><strong>{receipt.name}</strong><small>{formatBytes(receipt.size)}</small></span>
          </p>
        ) : null}
        {mutation.isPending ? (
          <div className="procurement-purchase-form__progress" role="status">
            <span>Uploading receipt and recording spending…</span>
            <ProgressBar
              {...(uploadProgress > 0
                ? { value: uploadProgress, label: "Receipt upload progress", valueText: `${uploadProgress}% uploaded` }
                : { label: "Receipt upload in progress" })}
            />
          </div>
        ) : null}
        {validation || mutation.isError ? (
          <p role="alert" className="procurement-purchase-form__error">
            {validation || procurementError(mutation.error, "The purchase could not be recorded. Try again with the same details.")}
          </p>
        ) : null}
        <div className="procurement-purchase-form__actions">
          <Button
            variant="destructive-outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="success"
            busy={mutation.isPending}
            busyLabel="Recording purchase…"
            leadingIcon={<ShoppingCart />}
          >
            {mutation.isError ? "Retry purchase" : "Record purchase"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
