import { FileText, Flag, Layers, MoreVertical, Ruler } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import {
  priorityDisplay,
  sectionSummary,
  unitLabel,
  type CatalogState
} from "./knowledgeIndexPresentation";
import type { KnowledgeItemListItem, KnowledgeMaster } from "./knowledgeTypes";

export interface KnowledgeIndexItemCardProps {
  readonly item: KnowledgeItemListItem;
  readonly uoms: readonly KnowledgeMaster[];
  readonly priorities: readonly KnowledgeMaster[];
  readonly catalogState: CatalogState;
  readonly onOpen: () => void;
}

function KnowledgeIndexMenu({ name, onOpen }: { name: string; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();

  function dismiss() {
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) dismiss();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div
      className="knowledge-index-menu"
      ref={container}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          dismiss();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          item.current?.focus();
        }
      }}
    >
      <Button
        ref={trigger}
        variant="quiet"
        aria-label={`More actions for ${name}`}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        leadingIcon={<MoreVertical aria-hidden="true" />}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div className="knowledge-index-menu__items" role="menu" aria-label={`Actions for ${name}`} id={id}>
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              dismiss();
              onOpen();
            }}
          >
            Open item
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function KnowledgeIndexItemCard({ item, uoms, priorities, catalogState, onOpen }: KnowledgeIndexItemCardProps) {
  const temporary = item.itemType === "temporary";
  const badgeId = `temporary-kind-${item.id}`;
  const badgeTitle = item.completionRequired ? "Temporary item · Must be completed" : "Temporary item";
  const sections = sectionSummary(item.completeness);
  const priority = priorityDisplay(item.priorityId, priorities, catalogState);
  const percentage = item.completeness.percentage;

  return (
    <article className="knowledge-item-card knowledge-index-card" data-item-type={item.itemType ?? "main_line"}>
      <div className="knowledge-index-card__body">
        <div className="knowledge-index-card__title">
          <div className="knowledge-index-card__thumb" aria-hidden="true">
            <Layers aria-hidden="true" />
          </div>
          <h3>
            <Link
              className="knowledge-item-link"
              to={`/admin/configuration/estimation/items/${encodeURIComponent(item.mainLineId)}`}
              aria-describedby={temporary ? badgeId : undefined}
            >
              {item.mainLineName}
            </Link>
          </h3>
          <KnowledgeIndexMenu name={item.mainLineName} onOpen={onOpen} />
        </div>
        {temporary ? (
          <span id={badgeId} className="knowledge-temporary-badge" title={badgeTitle}>
            Temporary item
            {item.completionRequired ? <span className="sr-only"> · Must be completed</span> : null}
          </span>
        ) : null}
        <div className="knowledge-item-card__progress">
          <span>{percentage}% complete</span>
          <ProgressBar value={percentage} label={`${item.mainLineName} completeness`} valueText={`${percentage}% complete`} />
        </div>
      </div>
      <ul className="knowledge-index-card__metrics" aria-label={`${item.mainLineName} details`}>
        {sections ? (
          <li className="knowledge-index-metric" data-metric="sections">
            <FileText aria-hidden="true" />
            <span aria-hidden="true">{`${sections.complete}/${sections.applicable} sections`}</span>
            <span className="sr-only">{`${sections.complete} of ${sections.applicable} sections complete`}</span>
          </li>
        ) : null}
        <li className="knowledge-index-metric" data-metric="unit">
          <Ruler aria-hidden="true" />
          <span><span className="sr-only">Unit: </span>{unitLabel(item.uomId, uoms, catalogState)}</span>
        </li>
        <li className="knowledge-priority-chip" data-tone={priority.tone}>
          <Flag aria-hidden="true" />
          <span><span className="sr-only">Priority: </span>{priority.label}</span>
        </li>
      </ul>
    </article>
  );
}
