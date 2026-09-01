import { ProgressBar } from "../../components/ui/ProgressBar";
import { Surface } from "../../components/ui/Surface";
import type { KnowledgeItemDetail, KnowledgeRevision } from "./knowledgeTypes";

export interface KnowledgeWorkspaceStatusProps {
  readonly item: KnowledgeItemDetail;
  readonly revision: KnowledgeRevision | null;
}

export function KnowledgeWorkspaceStatus({
  item,
  revision
}: KnowledgeWorkspaceStatusProps) {
  const blockerCount = item.blockers.length;
  const warningCount = item.warnings.length;
  const draftReadiness = blockerCount > 0
    ? `Blocked · ${blockerCount} ${blockerCount === 1 ? "blocker" : "blockers"}`
    : warningCount > 0
      ? `Ready with ${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`
      : "Ready to activate";
  const activationStatus = item.status === "archived"
    ? "Archived"
    : revision?.status === "draft"
      ? draftReadiness
      : item.status === "inactive"
        ? "Inactive"
        : revision?.status === "active"
          ? "Active"
          : "No revision";

  return (
    <Surface
      as="section"
      className="knowledge-workspace-status"
      variant="subtle"
      aria-label="Workspace status"
    >
      <div className="knowledge-summary-progress">
        <div>
          <span>Configuration completeness</span>
          <strong>{item.completeness.percentage}%</strong>
        </div>
        <ProgressBar
          value={item.completeness.percentage}
          label="Configuration completeness"
          valueText={`${item.completeness.percentage}% complete`}
        />
      </div>
      <dl className="knowledge-summary-list">
        <div>
          <dt>Activation status</dt>
          <dd>{activationStatus}</dd>
        </div>
        <div>
          <dt>{revision?.status === "draft" ? "Editing" : "Viewing"}</dt>
          <dd>
            {revision
              ? `${revision.status === "draft" ? "Draft" : "Active"} revision ${revision.revisionNumber}`
              : "No revision available"}
          </dd>
        </div>
        <div>
          <dt>Active revision</dt>
          <dd>
            {item.activeRevision
              ? `Revision ${item.activeRevision.revisionNumber}`
              : "No active revision"}
          </dd>
        </div>
      </dl>
    </Surface>
  );
}
