import type { EstimatePlanClientWorkspace, EstimatePlanPage } from "../../api/types";
import { ProtectedImage } from "../../components/design/ProtectedImage";

function statusLabel(status: EstimatePlanPage["status"]) {
  const label = status.replaceAll("_", " ");
  return label[0]!.toUpperCase() + label.slice(1);
}

export function ClientFullPlanNav({
  workspace,
  selectedPageId,
  onSelectPage
}: {
  workspace: EstimatePlanClientWorkspace;
  selectedPageId?: string;
  onSelectPage: (page: EstimatePlanPage) => void;
}) {
  const content = (
    <>
      <div className="client-plan-nav__pages">
        {workspace.pages.slice().sort((left, right) => left.pageNumber - right.pageNumber).map((page) => (
          <button
            type="button"
            className="client-plan-nav__page"
            aria-label={`Open design page ${page.pageNumber}`}
            aria-current={selectedPageId === page.id ? "page" : undefined}
            onClick={() => onSelectPage(page)}
            key={page.id}
          >
            <ProtectedImage source={page.thumbnailUrl} alt="" className="client-plan-nav__thumbnail" />
            <span><strong>Page {page.pageNumber}</strong><small>{statusLabel(page.status)}</small></span>
          </button>
        ))}
      </div>
      <div className="client-plan-nav__ask">
        <strong>Ask Lisno — coming soon</strong>
        <input aria-label="Ask Lisno question" placeholder="Ask about this design" disabled />
        <button type="button" aria-label="Ask Lisno" disabled>Ask</button>
      </div>
    </>
  );
  return (
    <aside className="client-plan-nav" aria-label="Full design plan">
      <header><p className="eyebrow">Full design</p><h4>Design pages</h4></header>
      <details className="client-plan-nav__drawer" open><summary>Design pages</summary>{content}</details>
    </aside>
  );
}
