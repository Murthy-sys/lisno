import { useId } from "react";
import { hasGovernedInHousePrice, lineAggregatePrice } from "../estimates/estimateAggregatePresentation";
import type { EstimateRevisionViewProps } from "./estimateRevisionComponents";
import { estimateRevisionLabel, type EstimateRevisionDetail } from "./estimateRevisionsApi";
import { revisionDate, revisionGroups, revisionMoney, revisionRooms, revisionStatus, savedText, type RevisionLine, type RevisionLineEntry } from "./estimateRevisionPresentation";
import "./estimateRevisions.css";

const count = (value: number) => `${value} ${value === 1 ? "item" : "items"}`;
const quantity = (value: number) => Number.isFinite(value) && value >= 0 ? value.toLocaleString("en-IN", { maximumFractionDigits: 20 }) : "Not recorded";
const modeNames = { pmc: "PMC", sub_vendor: "Sub-vendor", in_house: "In-house" };

function SavedLine({ line, showHierarchy }: { line: RevisionLine; showHierarchy: boolean }) {
  const title = savedText(line.mainLineName) ?? savedText(line.specification) ?? "Item name not recorded";
  const unit = savedText(line.uomName) ?? savedText(line.unit);
  const governed = hasGovernedInHousePrice(line);
  const aggregate = lineAggregatePrice(line, line);
  const aggregateRate = aggregate && line.quantity > 0 ? Math.round(aggregate.totalPaise / line.quantity) : null;
  const dimensions = line.dimensions ? (["length", "width", "height"] as const).flatMap(name => {
    const value = savedText(line.dimensions?.[name]);
    return value ? [`${name[0]!.toUpperCase()}${name.slice(1)} ${value}${line.dimensionRule?.inputUnit ? ` ${line.dimensionRule.inputUnit}` : ""}`] : [];
  }) : [];
  return <article className="estimate-revision-line" aria-label={title}>
    <div className="estimate-revision-line__identity"><h4>{title}</h4>
      <p className="estimate-revision-line__meta"><span>{savedText(line.roomName) ?? "Room not recorded"}</span>
        {line.classification ? <span>{line.classification === "special" ? "Special" : "Standard"}</span> : null}
        {line.pricingMode ? <span>{modeNames[line.pricingMode]}</span> : null}
        {line.modeTier ? <span>{line.modeTier[0]!.toUpperCase()}{line.modeTier.slice(1)}</span> : null}
        <span>{line.included ? "Included" : "Not included"}</span>
      </p>
      {showHierarchy && (line.mainBasketName || line.subBasketName) ? <p className="estimate-revision-line__meta">{[line.mainBasketName, line.subBasketName].filter(Boolean).join(" / ")}</p> : null}
      {line.specification && line.specification !== title ? <p className="estimate-revision-line__description">{line.specification}</p> : null}
      {dimensions.length ? <p className="estimate-revision-line__meta">{dimensions.join(" · ")}</p> : line.dimensionsMandatory ? <p className="estimate-revision-line__meta">Dimensions not recorded</p> : null}
      {line.estimateNotes?.length ? <ul className="estimate-revision-line__notes">{line.estimateNotes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
    </div>
    <dl className="estimate-revision-line__amounts">
      <div><dt>Quantity{unit ? ` (${unit})` : ""}</dt><dd>{quantity(line.quantity)}</dd></div>
      <div><dt>{governed ? "Price including margin" : "Rate"}{unit ? ` (₹/${unit})` : ""}</dt><dd>{governed ? revisionMoney(aggregateRate) : line.componentPricing && line.ratePaise === null ? "Component pricing" : revisionMoney(line.ratePaise, line.rate)}</dd></div>
      <div><dt>Amount</dt><dd>{revisionMoney(line.amountPaise, line.amount)}</dd></div>
    </dl>
    {!governed && line.componentPricing ? <details className="estimate-revision-line__components"><summary>Saved component amounts for {title}</summary>
      <p>{line.componentPricing.quantity} {line.componentPricing.uom.name} · {revisionMoney(line.componentPricing.totalPaise)}</p>
      <ul>{line.componentPricing.components.map((component, index) => <li key={`${component.id}:${index}`}>
        <strong>{component.basketName}{component.subBasketName ? ` / ${component.subBasketName}` : ""}</strong>
        <dl><div><dt>Labour</dt><dd>{revisionMoney(component.laborSellingPaise)}</dd></div>
          <div><dt>Material</dt><dd>{revisionMoney(component.materialSellingPaise)}</dd></div>
          <div><dt>Total</dt><dd>{revisionMoney(component.totalPaise)}</dd></div></dl>
      </li>)}</ul>
    </details> : null}
  </article>;
}

function SavedItems({ entries }: { entries: readonly RevisionLineEntry[] }) {
  const groups = revisionGroups(entries);
  if (!entries.length) return <p className="estimate-revision-view__empty">No saved items in this selection.</p>;
  return <div className="estimate-revision-view__groups">{groups.map((group, groupIndex) => <section className="estimate-revision-group" key={group.id ?? "ungrouped"} aria-label={group.name}>
    <h3>{group.name}<small>{count(group.sections.reduce((total, section) => total + section.entries.length, 0))}</small></h3>
    {group.sections.map((section, sectionIndex) => <div className="estimate-revision-group__section" key={section.id ?? "unassigned"}>
      {section.id ? <h4>{section.name}</h4> : null}
      <div className="estimate-revision-group__lines">{section.entries.map(({ line, index }) => <SavedLine key={`${groupIndex}:${sectionIndex}:${line.id ?? "line"}:${index}`} line={line} showHierarchy={!group.id} />)}</div>
    </div>)}
  </section>)}</div>;
}

function RecordedTotals({ revision }: { revision: EstimateRevisionDetail }) {
  const snapshot = revision.snapshot;
  return <dl className="estimate-revision-totals" aria-label="Saved revision totals">
    <div><dt>Subtotal before GST</dt><dd>{revisionMoney(revision.subtotalPaise)}</dd></div>
    <div><dt>GST</dt><dd>{revisionMoney(snapshot.gstPaise, snapshot.gst)}</dd></div>
    {snapshot.roundOffPaise !== undefined && snapshot.roundOffPaise !== 0 ? <div><dt>Round off</dt><dd>{snapshot.roundOffPaise < 0 ? "−" : "+"}{revisionMoney(Math.abs(snapshot.roundOffPaise))}</dd></div> : null}
    <div><dt>Total including GST</dt><dd>{revisionMoney(snapshot.totalPaise, snapshot.total)}</dd></div>
  </dl>;
}

export function EstimateRevisionView({ revision, view, activeRoomId, onSelectRoom, navigation }: EstimateRevisionViewProps) {
  const headingId = useId();
  const rooms = revisionRooms(revision.snapshot);
  const activeRoom = rooms.find(room => room.id === activeRoomId);
  const entries = revision.snapshot.lineItems.map((line, index) => ({ line, index }));
  const visibleEntries = activeRoom ? entries.filter(entry => entry.line.roomId === activeRoom.id) : entries;
  const included = revision.snapshot.lineItems.filter(line => line.included);
  const ungrouped = included.filter(line => !savedText(line.roomId));
  const label = estimateRevisionLabel(revision);
  return <div className="estimate-revision-view">
    <aside className="estimate-revision-view__rail" aria-label="Revision and room navigation">
      {navigation}
      <nav className="estimate-revision-rooms" aria-label="Saved revision rooms"><h2>Rooms</h2>
        <button type="button" aria-current={!activeRoom ? "true" : undefined} onClick={() => onSelectRoom(null)}><strong>All rooms</strong><small>{count(entries.length)}</small></button>
        {rooms.map(room => <button type="button" key={room.id} aria-current={activeRoom?.id === room.id ? "true" : undefined} onClick={() => onSelectRoom(room.id)}>
          <strong>{room.label}</strong><small>{count(entries.filter(entry => entry.line.roomId === room.id).length)}</small>
        </button>)}
        {!rooms.length ? <p>Room grouping was not recorded.</p> : null}
      </nav>
    </aside>
    <section className="estimate-revision-view__content" aria-labelledby={headingId}>
      <header className="estimate-revision-view__heading"><div><h2 id={headingId}>{label}</h2><p>{revisionStatus[revision.status]} · <time dateTime={revision.submittedAt}>{revisionDate(revision.submittedAt)}</time></p></div><span>Read-only</span></header>
      <p className="sr-only" role="status">Showing {label}, {view === "builder" ? "saved items" : view}. Read-only.</p>
      <div className="estimate-revision-view__scroll" role="region" aria-label={`Saved revision ${view === "builder" ? "items" : view}`} tabIndex={0}>
        {view === "summary" ? <div className="estimate-revision-view__summary"><h3>Saved estimate summary</h3>
          {(activeRoom ? [activeRoom] : rooms).map(room => <div className="estimate-revision-view__summary-row" key={room.id}><strong>{room.label}</strong><span>{count(included.filter(line => line.roomId === room.id).length)} included</span></div>)}
          {!activeRoom && ungrouped.length ? <div className="estimate-revision-view__summary-row"><strong>Ungrouped saved items</strong><span>{count(ungrouped.length)} included</span></div> : null}
          {!included.length ? <p>No included items were recorded.</p> : null}
          <RecordedTotals revision={revision} />
        </div> : <>
          {view === "proposal" ? <div className="estimate-revision-view__proposal-context"><h3>Saved proposal</h3><p>{revision.snapshot.projectName || "Project name not recorded"}</p><p>{[revision.snapshot.clientName, revision.snapshot.location, revision.snapshot.propertyType].filter(Boolean).join(" · ")}</p></div> : null}
          {activeRoom ? <p className="estimate-revision-view__room-context">{activeRoom.label} · {count(visibleEntries.length)}</p> : null}
          <SavedItems entries={visibleEntries} />
          {view === "proposal" ? <RecordedTotals revision={revision} /> : null}
        </>}
      </div>
    </section>
  </div>;
}
