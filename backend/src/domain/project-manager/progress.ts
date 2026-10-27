import type { PMProgress, PMHealth } from "../../contracts/project-manager.js";
export interface PMProgressAllocation { id: string; quantity: number; uom: string; progress: number | null; startDate: string | null; finishDate: string | null; siteVerified: boolean; clientAccepted: boolean; }
export interface PMProgressLine { id: string; quantity: number; uom: string; netPaise: number | null; scope: "execution" | "supply" | "unknown"; exception?: "not_applicable" | "externally_fulfilled"; allocations: PMProgressAllocation[]; }
const ordinal = (value: string): number | null => { const n = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n / 86400000 : null; };
export function approvedExecutionProgress(lines: PMProgressLine[], sourceRevision: string | null, today: string, sourceIssues: string[] = []): PMProgress {
  const issues = [...sourceIssues]; let totalWeight = 0, actualWeighted = 0, plannedWeighted = 0;
  let actualKnown = Boolean(sourceRevision), plannedKnown = Boolean(sourceRevision), coveredLines = 0, requiredLines = 0, zeroValueLines = 0;
  let reportedComplete = 0, siteVerified = 0, clientAccepted = 0;
  const ids = new Set<string>(); const day = ordinal(today);
  for (const line of lines) {
    if (line.exception === "not_applicable" || line.scope === "supply") continue;
    requiredLines++;
    if (line.scope === "unknown") { issues.push(`Execution scope is not established for item ${line.id}.`); actualKnown = plannedKnown = false; continue; }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !line.uom || line.netPaise === null || !Number.isSafeInteger(line.netPaise) || line.netPaise < 0) {
      issues.push(`Approved quantity, unit or net value is unavailable for item ${line.id}.`); actualKnown = plannedKnown = false; continue;
    }
    const weight = line.netPaise; totalWeight += weight;
    if (!Number.isSafeInteger(totalWeight)) { issues.push("Approved values exceed the supported safe range."); actualKnown = plannedKnown = false; }
    if (weight === 0) zeroValueLines++;
    if (line.exception === "externally_fulfilled") { coveredLines++; actualWeighted += weight * 100; plannedWeighted += weight * 100; continue; }
    let quantity = 0, actual = 0, planned = 0;
    for (const allocation of line.allocations) {
      if (ids.has(allocation.id) || !Number.isFinite(allocation.quantity) || allocation.quantity <= 0 || allocation.uom.trim().toLowerCase() !== line.uom.trim().toLowerCase()) {
        issues.push(`Issued allocation or unit conflicts with item ${line.id}.`); actualKnown = plannedKnown = false; continue;
      }
      ids.add(allocation.id); quantity += allocation.quantity;
      if (allocation.progress === null || !Number.isFinite(allocation.progress) || allocation.progress < 0 || allocation.progress > 100) { actualKnown = false; issues.push(`Current progress is unavailable for item ${line.id}.`); }
      else { actual += allocation.quantity * allocation.progress; if (allocation.progress === 100) reportedComplete++; }
      if (allocation.siteVerified) siteVerified++;
      if (allocation.clientAccepted) clientAccepted++;
      const start = allocation.startDate ? ordinal(allocation.startDate) : null;
      const finish = allocation.finishDate ? ordinal(allocation.finishDate) : null;
      if (day === null || start === null || finish === null || finish < start) plannedKnown = false;
      else planned += allocation.quantity * 100 * Math.max(0, Math.min(1, (day - start) / (finish - start + 1)));
    }
    if (quantity > line.quantity + 0.000001) { actualKnown = plannedKnown = false; issues.push(`Execution allocations overlap the approved quantity for item ${line.id}.`); }
    if (Math.abs(quantity - line.quantity) <= 0.000001) coveredLines++; else plannedKnown = false;
    actualWeighted += weight * actual / line.quantity; plannedWeighted += weight * planned / line.quantity;
  }
  if (sourceIssues.length) actualKnown = plannedKnown = false;
  if (!plannedKnown && requiredLines) issues.push("A complete confirmed schedule is not available.");
  if (!totalWeight) { actualKnown = plannedKnown = false; if (requiredLines) issues.push("No positive approved execution value is available for weighting."); }
  const rounded = (n: number) => Math.round(n * 10) / 10;
  return { basis: "approved_execution_scope_v1", actual: actualKnown ? rounded(actualWeighted / totalWeight) : null, planned: plannedKnown ? rounded(plannedWeighted / totalWeight) : null,
    availability: actualKnown ? "available" : sourceRevision ? "source_unavailable" : "no_data", sourceRevision, issues: [...new Set(issues)], requiredLines, coveredLines, zeroValueLines, reportedComplete, siteVerified, clientAccepted };
}
export function pmHealth(input: { status: string; critical: boolean; warning: boolean; progress: PMProgress; started: boolean; setup: boolean }): PMHealth {
  if (input.status === "completed") return "completed";
  if (input.critical) return "critical";
  if (input.warning || input.status === "on_hold" || input.progress.actual !== null && input.progress.planned !== null && input.progress.actual < input.progress.planned) return "at_risk";
  if (input.progress.actual === null || input.started && input.progress.planned === null) return "incomplete";
  if (!input.started && input.setup) return "setup";
  return "on_track";
}
