import { useId } from "react";
import { Link } from "react-router-dom";
import type { KnowledgeItemListItem, KnowledgeTemporaryMainLineReference } from "./knowledgeTypes";

export function KnowledgeTemporaryMainLineInfo({ item, compact = false, onOpenMainLine }: {
  readonly item: Pick<KnowledgeItemListItem, "itemType" | "linkedMainLines">;
  readonly compact?: boolean;
  readonly onOpenMainLine?: (mainLineId: string) => void;
}) {
  const id = useId();
  if (item.itemType !== "temporary") return null;
  const groups = new Map<string, KnowledgeTemporaryMainLineReference[]>();
  for (const reference of item.linkedMainLines ?? []) {
    groups.set(reference.mainLineId, [...(groups.get(reference.mainLineId) ?? []), reference]);
  }
  const Heading = compact ? "h4" : "h2";
  return <section className={`knowledge-temporary-main-lines${compact ? " knowledge-temporary-main-lines--compact" : ""}`} aria-labelledby={id}>
    <Heading id={id}>Main Line info</Heading>
    {item.linkedMainLines === undefined ? <p>Main Line details are unavailable. Refresh to load them.</p>
      : groups.size === 0 ? <p>No saved Main Line reference yet. Save a Budget Alteration rule that uses this temporary item to link it.</p>
        : <ul>{[...groups].map(([mainLineId, references]) => {
          const source = references[0];
          return <li key={mainLineId}>
            <Link className="knowledge-temporary-main-lines__name" to={`/admin/configuration/estimation/items/${encodeURIComponent(mainLineId)}`}
              onClick={(event) => {
                if (!onOpenMainLine || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onOpenMainLine(mainLineId);
              }}>{source.mainLineName}</Link>
            <p className="knowledge-temporary-main-lines__location">Main Basket · {source.basketName}{source.subBasketName ? ` · Sub Basket · ${source.subBasketName}` : ""}</p>
            {source.status === "inactive" && <p>Inactive Main Line</p>}
            {compact ? <p className="knowledge-temporary-main-lines__revisions">{references.map((reference) => reference.revisionStatus === "draft" ? "Draft reference" : "Active reference").join(" · ")}</p>
              : references.map((reference) => <div className="knowledge-temporary-main-lines__reference" key={reference.revisionId}>
                <span className="knowledge-temporary-main-lines__revision">{reference.revisionStatus === "draft" ? "Draft reference" : "Active reference"}</span>
                {reference.rules.map((rule) => <div className="knowledge-temporary-main-lines__rule" key={rule.id}>
                  <p>{rule.active ? "" : "Disabled rule · "}When this Main Line is {rule.trigger === "added" ? "added to" : "removed from"} scope, this temporary item {rule.requirement} be {rule.action === "add" ? "added" : "removed"}.</p>
                  <p><strong>Why:</strong> {rule.reason}</p>
                </div>)}
              </div>)}
          </li>;
        })}</ul>}
  </section>;
}
