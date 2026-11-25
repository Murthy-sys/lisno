import { useId, useRef } from "react";
import { procurementEstimateModeLabels } from "./ProcurementBasketModeGroups";
import type { ProcurementBasketPriorityGroup, ProcurementPriorityGroupKey, ProcurementPriorityResolution } from "./procurementBasketApi";
import "./procurementBasketPriorityGroups.css";

export interface ProcurementPriorityViewState {
  search: string;
  expanded: Partial<Record<ProcurementPriorityGroupKey, boolean>>;
  searchExpanded: Partial<Record<ProcurementPriorityGroupKey, boolean>>;
}

export const initialProcurementPriorityView: ProcurementPriorityViewState = { search: "", expanded: {}, searchExpanded: {} };

const resolutionLabels: Record<ProcurementPriorityResolution["state"], string | null> = {
  resolved: null,
  unset: "No priority selected in Configuration",
  unavailable: "Current Configuration unavailable",
  invalid: "Saved priority needs review",
  legacy: "Main Line Configuration not linked"
};

export function ProcurementBasketPriorityGroups({ groups, preferences, onPreferencesChange, onOpen }: {
  groups: ProcurementBasketPriorityGroup[];
  preferences: ProcurementPriorityViewState;
  onPreferencesChange: (value: ProcurementPriorityViewState) => void;
  onOpen: (basketId: string) => void;
}) {
  const id = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const query = preferences.search.trim().toLocaleLowerCase();
  const visible = groups.map(group => ({ group, items: group.items.filter(item =>
    [item.mainLineName, item.basketName, item.subBasketName, item.roomName].some(value => value?.toLocaleLowerCase().includes(query)))
  })).filter(({ items }) => items.length > 0);
  const count = visible.reduce((total, entry) => total + entry.items.length, 0);
  const search = (value: string) => onPreferencesChange({ ...preferences, search: value, searchExpanded: {} });

  return <section className="procurement-priority" aria-labelledby={`${id}-title`}>
    <header className="procurement-priority__toolbar">
      <div><h2 id={`${id}-title`}>Main Lines by priority</h2><p>Priority follows each Main Line's saved Configuration.</p></div>
      <label className="procurement-priority__search"><span>Search Main Lines</span>
        <input ref={searchInput} type="search" value={preferences.search} placeholder="Main Line, basket or room…" onChange={event => search(event.target.value)} />
      </label>
    </header>
    <p className="procurement-priority__scope">Open basket shows its full approved scope.</p>
    <p className="procurement-priority__count" role="status">{count} {query ? "matching " : ""}item{count === 1 ? "" : "s"}</p>
    {!groups.length ? <p className="procurement-priority__empty">No approved Main Line items are available for this project.</p>
      : !visible.length ? <div className="procurement-priority__empty"><p>No Main Lines match your search.</p><button type="button" onClick={() => { search(""); searchInput.current?.focus(); }}>Clear search</button></div> : null}
    <div className="procurement-priority__groups">
      {visible.map(({ group, items }) => {
        const label = group.priority === "unassigned" ? "Priority not set" : group.priority;
        const expanded = query ? preferences.searchExpanded[group.priority] ?? true
          : preferences.expanded[group.priority] ?? group.priority === groups[0]?.priority;
        const panelId = `${id}-${group.priority}`;
        return <section className="procurement-priority__group" key={group.priority} aria-labelledby={`${panelId}-heading`}>
          <h3 id={`${panelId}-heading`}><button type="button" className="procurement-priority__toggle" aria-expanded={expanded} aria-controls={panelId}
            onClick={() => onPreferencesChange(query
              ? { ...preferences, searchExpanded: { ...preferences.searchExpanded, [group.priority]: !expanded } }
              : { ...preferences, expanded: { ...preferences.expanded, [group.priority]: !expanded } })}>
            <strong>{label}</strong><span>{query ? `${items.length} of ${group.lineCount}` : group.lineCount} item{group.lineCount === 1 ? "" : "s"}</span>
            <span className="procurement-priority__disclosure" aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button></h3>
          <div id={panelId} hidden={!expanded}>
            <table className="procurement-priority__table">
              <caption className="sr-only">{label} Main Lines</caption>
              <thead><tr><th scope="col">Main Line</th><th scope="col">Room</th><th scope="col">Basket</th><th scope="col">Execution mode</th><th scope="col">Action</th></tr></thead>
              <tbody>{items.map(item => <tr key={item.sourceLineItemKey}>
                <th scope="row" data-label="Main Line"><strong>{item.mainLineName || "Main Line name unavailable"}</strong>
                  {resolutionLabels[item.resolution.state] ? <small>{resolutionLabels[item.resolution.state]}</small> : null}
                  {item.scope === "commitment_only" ? <small>Retained for an existing commitment</small> : null}
                </th>
                <td data-label="Room">{item.roomName || "Room not recorded"}</td>
                <td data-label="Basket"><span>{item.basketName}</span>{item.subBasketName ? <small>{item.subBasketName}</small> : null}</td>
                <td data-label="Execution mode">{procurementEstimateModeLabels[item.mode]}</td>
                <td data-label="Action"><button type="button" className="procurement-priority__open" onClick={() => onOpen(item.basketId)}
                  aria-label={`Open basket ${item.basketName} for ${item.mainLineName || "Main Line"}${item.roomName ? ` in ${item.roomName}` : ""}`}>Open basket</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>;
      })}
    </div>
  </section>;
}
