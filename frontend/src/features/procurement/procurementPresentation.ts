import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../../api/client";
import type { ProcurementProject } from "../../api/types";
import { getProcurementProjects, procurementKeys } from "./procurementApi";

export const RECEIPT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const receiptMimeByExtension = new Map([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"]
]);

export const purchaseDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC"
});

export const quantity = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 3
});

export function procurementProjectPath(projectId: string) {
  return `/procurement/projects/${encodeURIComponent(projectId)}`;
}

/**
 * Both the /home list and the project page read the same authorized projects
 * payload, so they share one query, one integrity gate, and one display filter.
 */
export function useProcurementProjects(enabled: boolean) {
  const query = useQuery({
    queryKey: procurementKeys.projects,
    queryFn: getProcurementProjects,
    enabled
  });
  const integrityError = query.data
    ? procurementProjectsIntegrityError(query.data)
    : null;
  const projects = useMemo(
    () => query.data && !integrityError
      ? query.data.map(procurementProjectForDisplay)
      : null,
    [integrityError, query.data]
  );

  return { query, integrityError, projects };
}

export function procurementProjectEstimatedTotal(project: ProcurementProject) {
  return project.sections.reduce(
    (total, section) => total + section.estimatedAmountPaise,
    0
  );
}

export function procurementProjectActualTotal(project: ProcurementProject) {
  return project.sections.reduce(
    (total, section) => total + section.actualSpendPaise,
    0
  );
}

export function procurementProjectForDisplay(
  project: ProcurementProject
): ProcurementProject {
  return {
    ...project,
    sections: project.sections.flatMap((section) => {
      if (section.estimatedAmountPaise <= 0) return [];
      const items = section.items.filter((item) => item.estimatedAmountPaise > 0);
      return items.length > 0 ? [{ ...section, items }] : [];
    })
  };
}

export function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;
  const paise = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}

export function procurementReceiptError(receipt: File | null): string {
  if (!receipt) return "Choose a receipt or supporting document.";
  if (receipt.size <= 0) return "The selected supporting document is empty.";
  const extension = receipt.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedMime = receiptMimeByExtension.get(extension);
  if (!expectedMime || (receipt.type && receipt.type.toLowerCase() !== expectedMime)) {
    return "Choose a PDF, JPEG, PNG, or WebP supporting document with a matching file extension.";
  }
  return "";
}

export function procurementProjectsIntegrityError(
  projects: ProcurementProject[]
): string | null {
  const projectIds = new Set<string>();
  for (const project of projects) {
    if (!project.projectId || projectIds.has(project.projectId)) {
      return "Procurement data contains a duplicate or missing project identity. Refresh before recording spending.";
    }
    projectIds.add(project.projectId);
    const itemKeys = new Set<string>();
    const sectionIds = new Set<string>();
    const expenseIds = new Set<string>();
    let projectEstimatedPaise = 0n;
    let projectActualPaise = 0n;
    for (const section of project.sections) {
      if (!section.id || sectionIds.has(section.id)) {
        return "Procurement data contains a duplicate or missing Estimate section identity. Refresh before recording spending.";
      }
      sectionIds.add(section.id);
      if (!isSafeNonNegativePaise(section.estimatedAmountPaise) ||
        !isSafeNonNegativePaise(section.actualSpendPaise)) {
        return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
      }
      if (section.estimatedAmountPaise === 0 && (
        section.actualSpendPaise > 0 ||
        section.items.some((item) => item.expenses.length > 0)
      )) {
        return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
      }
      let sectionEstimatedPaise = 0n;
      let sectionActualPaise = 0n;
      projectEstimatedPaise += BigInt(section.estimatedAmountPaise);
      projectActualPaise += BigInt(section.actualSpendPaise);
      for (const item of section.items) {
        if (!item.key || itemKeys.has(item.key)) {
          return "Procurement data contains a duplicate or missing Estimate item identity. Refresh before recording spending.";
        }
        itemKeys.add(item.key);
        if (!Number.isFinite(item.quantity) || item.quantity < 0) {
          return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
        }
        if (!isSafeNonNegativePaise(item.estimatedAmountPaise) ||
          !isSafeNonNegativePaise(item.actualSpendPaise)) {
          return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
        }
        if (item.estimatedAmountPaise === 0 && (
          item.actualSpendPaise > 0 || item.expenses.length > 0
        )) {
          return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
        }
        sectionEstimatedPaise += BigInt(item.estimatedAmountPaise);
        sectionActualPaise += BigInt(item.actualSpendPaise);
        let postedItemSpendPaise = 0n;
        const lineageMismatch = item.expenses.some((expense) =>
          expense.projectId !== project.projectId ||
          expense.sourceSectionId !== section.id ||
          expense.sourceLineItemKey !== item.key ||
          expense.type !== "direct_spend" ||
          expense.expenseClass !== "procurement" ||
          expense.status !== "posted"
        );
        if (lineageMismatch) {
          return "A recorded purchase does not match this project, section, or Estimate item. Refresh before recording spending.";
        }
        for (const expense of item.expenses) {
          if (!expense.id || expenseIds.has(expense.id)) {
            return "Procurement data contains a duplicate or missing purchase identity. Refresh before recording spending.";
          }
          expenseIds.add(expense.id);
          if (!Number.isSafeInteger(expense.amountPaise) || expense.amountPaise <= 0) {
            return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
          }
          if (expense.supportingDocument && (
            !expense.supportingDocument.id ||
            !Number.isSafeInteger(expense.supportingDocument.sizeBytes) ||
            expense.supportingDocument.sizeBytes <= 0
          )) {
            return "Procurement data contains invalid supporting-document metadata. Refresh before opening receipts.";
          }
          postedItemSpendPaise += BigInt(expense.amountPaise);
        }
        if (postedItemSpendPaise !== BigInt(item.actualSpendPaise)) {
          return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
        }
      }
      if (sectionEstimatedPaise !== BigInt(section.estimatedAmountPaise) ||
        sectionActualPaise !== BigInt(section.actualSpendPaise)) {
        return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
      }
    }
    if (projectEstimatedPaise > BigInt(Number.MAX_SAFE_INTEGER) ||
      projectActualPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
      return PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE;
    }
  }
  return null;
}

const PROCUREMENT_AMOUNT_INTEGRITY_MESSAGE =
  "Procurement amounts do not reconcile with the approved Estimate and posted purchases. Refresh before recording spending.";

function isSafeNonNegativePaise(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function procurementError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function procurementRequestKey() {
  return globalThis.crypto?.randomUUID?.() ?? `procurement-${Date.now()}-${Math.random()}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
