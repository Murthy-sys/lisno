import { useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Surface } from "../../components/ui/Surface";
import type { SavedSummaryGroup, SavedSummaryRow } from "./knowledgeSavedSummaryTypes";
import type { KnowledgeItemDetail } from "./knowledgeTypes";

export interface KnowledgeHierarchySummaryProps {
  readonly item: Pick<KnowledgeItemDetail, "basketName" | "subBasketId" | "subBasketName" | "mainLineName">;
  readonly groups?: readonly SavedSummaryGroup[];
  readonly sourceKey?: string;
}

export function KnowledgeHierarchySummary({ item, groups, sourceKey }: KnowledgeHierarchySummaryProps) {
  const titleId = useId();

  return (
    <Surface as="section" className="knowledge-hierarchy-summary" aria-labelledby={titleId}>
      <h2 id={titleId}>Quick summary</h2>
      <div key={sourceKey} className="knowledge-hierarchy-summary__body" role="region" aria-label="Quick summary details" tabIndex={0}>
        <dl>
          <div>
            <dt>Main Basket</dt>
            <dd>{displayName(item.basketName)}</dd>
          </div>
          <div>
            <dt>Sub-Basket</dt>
            <dd>{item.subBasketId ? displayName(item.subBasketName) : "Not assigned"}</dd>
          </div>
          <div>
            <dt>Main Line</dt>
            <dd>{displayName(item.mainLineName)}</dd>
          </div>
        </dl>
        {groups ? <SavedGroups groups={groups} /> : null}
      </div>
    </Surface>
  );
}

function SavedGroups({ groups }: { readonly groups: readonly SavedSummaryGroup[] }) {
  return <div className="knowledge-saved-summary">
    <p className="knowledge-saved-summary__caption">Saved configuration</p>
    {groups.map((group) => <SavedGroup key={group.key} group={group} />)}
  </div>;
}

function SavedGroup({ group }: { readonly group: SavedSummaryGroup }) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useVisibleSummaryToggle(expanded);
  const id = useId();
  const preview = group.preview.slice(0, 3);
  const hasDetails = group.details.length > 0 && (JSON.stringify(preview) !== JSON.stringify(group.details)
    || preview.some((row) => row.value.length > 120));
  const rows = expanded ? group.details : preview;
  return <section className="knowledge-saved-summary__group" aria-label={`${group.label} saved summary`}>
    <h3>{group.label}</h3>
    {group.key === "quality" ? <p className="knowledge-saved-summary__shared">Shared checklist</p> : null}
    {group.notices.map((notice) => <div key={notice.key} className={`knowledge-saved-summary__notice knowledge-saved-summary__notice--${notice.tone}`}
      role={notice.tone === "error" ? "alert" : undefined}>
      <span>{notice.message}</span>
      {notice.onRetry ? <Button variant="quiet" size="compact" onClick={notice.onRetry}
        aria-label={`Retry ${group.label}: ${notice.message}`}>Retry</Button> : null}
    </div>)}
    <div id={id}>
      {rows.length ? <dl className="knowledge-saved-summary__rows">
        {rows.map((row) => <div key={row.key}>
          <dt>{row.label}</dt>
          <dd>{expanded ? <FullValue key={row.value} row={row} groupLabel={group.label} />
            : row.value.length > 120 ? `${row.value.slice(0, 120)}…` : row.value}</dd>
        </div>)}
      </dl> : group.emptyMessage ? <p className="knowledge-saved-summary__empty">{group.emptyMessage}</p> : null}
    </div>
    {hasDetails ? <Button ref={toggleRef} variant="quiet" size="compact" className="knowledge-saved-summary__toggle"
      aria-label={`${expanded ? "Hide" : "Show"} ${group.label} details`} aria-expanded={expanded}
      aria-controls={id} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : "Show details"}</Button> : null}
  </section>;
}

function FullValue({ row, groupLabel }: { readonly row: SavedSummaryRow; readonly groupLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useVisibleSummaryToggle(expanded);
  const id = useId();
  const long = row.value.length > 240;
  return <><span id={id}>{long && !expanded ? `${row.value.slice(0, 240)}…` : row.value}</span>
    {long ? <Button ref={toggleRef} variant="quiet" size="compact" className="knowledge-saved-summary__toggle"
      aria-label={`${expanded ? "Show less" : "Show full value"}: ${groupLabel}, ${row.label}`}
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
      {expanded ? "Show less" : "Show more"}
    </Button> : null}</>;
}

function useVisibleSummaryToggle(expanded: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const toggle = ref.current;
    if (!toggle || toggle.ownerDocument.activeElement !== toggle) return;
    const body = toggle.closest<HTMLElement>(".knowledge-hierarchy-summary__body");
    if (!body || body.clientHeight <= 0) return;
    const bodyBounds = body.getBoundingClientRect();
    const toggleBounds = toggle.getBoundingClientRect();
    const focusInset = 4;
    const viewportTop = bodyBounds.top + body.clientTop;
    const top = viewportTop + focusInset;
    const bottom = viewportTop + body.clientHeight - focusInset;
    // Native collapse clamps scrollTop but can leave the focused toggle outside
    // the scrollport. Adjust only this body; ancestor/page scrolling must stay put.
    if (toggleBounds.top < top) body.scrollTop += toggleBounds.top - top;
    else if (toggleBounds.bottom > bottom) body.scrollTop += toggleBounds.bottom - bottom;
  }, [expanded]);
  return ref;
}

function displayName(name: string | null | undefined): string {
  return name?.trim() || "Name unavailable";
}
