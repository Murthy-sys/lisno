import { ProgressBar } from "../../components/ui/ProgressBar";
import { Surface } from "../../components/ui/Surface";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

export interface KnowledgeWorkspaceStatusProps {
  readonly item: KnowledgeItemDetail;
}

/*
 * Completeness is the only status an author acts on here. Revision numbers and
 * activation readiness are lifecycle detail: the revision is already named in
 * the section header, and blockers and warnings are listed in the activation
 * dialog, where they can actually be resolved.
 */
export function KnowledgeWorkspaceStatus({ item }: KnowledgeWorkspaceStatusProps) {
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
    </Surface>
  );
}
