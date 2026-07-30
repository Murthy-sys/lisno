import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AsyncState } from "../../components/ui/AsyncState";
import { calculateEstimateTotals, defaultQuantity, resolveRate, type QuantityBasis } from "./estimateEngine";
import { estimateBuilderSections } from "./estimateBuilderCatalogue";
import { getLead, getLeadEstimate, leadKeys, saveLeadEstimate, sendEstimateToClient, submitLeadEstimate } from "./leadsApi";
import { EstimateDesignUploads } from "./EstimateDesignUploads";

const propertyTypes = ["1BHK", "2BHK", "2.5BHK", "3BHK", "3.5BHK", "4BHK", "Villa", "Penthouse", "Studio", "Duplex"];
const roomDefinitions = [
  { typeId: "living", label: "Living & Dining", icon: "🛋️", sqft: 300 },
  { typeId: "master", label: "Master Bedroom", icon: "🛏️", sqft: 200 },
  { typeId: "bedroom2", label: "Bedroom 2", icon: "🛏️", sqft: 150 },
  { typeId: "bedroom3", label: "Bedroom 3", icon: "🛏️", sqft: 130 },
  { typeId: "kitchen", label: "Kitchen", icon: "🍳", sqft: 120 },
  { typeId: "bath_m", label: "Master Bathroom", icon: "🚿", sqft: 80 },
  { typeId: "bath_c", label: "Common Bathroom", icon: "🚿", sqft: 60 },
  { typeId: "balcony", label: "Balcony / Utility", icon: "🌿", sqft: 60 },
  { typeId: "foyer", label: "Foyer / Entrance", icon: "🚪", sqft: 80 },
  { typeId: "study", label: "Home Office/Study", icon: "💼", sqft: 120 },
  { typeId: "custom", label: "Custom Room", icon: "✏️", sqft: 0 }
] as const;
const scopeDescriptions: Record<string, string> = {
  FC: "Gypsum, POP, cove work", FL: "Tiles, wood, marble, skirting",
  CA: "Modular, custom, wardrobes, kitchen", PA: "Wall paint, texture, wallpaper",
  EL: "Points, LED, DB, spotlights", CV: "Waterproofing, bathroom, kitchen plumbing",
  LF: "Sofa, dining, mattress"
};
type EstimateTab = "configure" | "builder" | "summary" | "proposal";
type RoomDraft = { id: string; typeId: string; label: string; icon: string; sqft: number; length: number | null; width: number | null };
type LineDraft = { id: string; catalogueId: string; sectionId: string; sectionLabel: string; roomName: string; specification: string; options: readonly string[]; unit: string; rate: number; quantity: number; included: boolean };
type BuilderRow = {
  id: string;
  description: string;
  unit: string;
  baseRate: number;
  rates: Readonly<Record<string, number>> | null;
  specifications: readonly string[];
  quantityBasis: string;
};
const catalogueRows: BuilderRow[] = estimateBuilderSections.flatMap(
  (section) => Array.from(section.rows as unknown as readonly BuilderRow[])
);
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function LeadEstimateWorkspace() {
  const { leadId = "" } = useParams();
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => getLead(leadId) });
  const saved = useQuery({ queryKey: [...leadKeys.detail(leadId), "estimate"], queryFn: () => getLeadEstimate(leadId), retry: false });
  const [tab, setTab] = useState<EstimateTab>("configure");
  const [propertyType, setPropertyType] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [enabledSections, setEnabledSections] = useState<Set<string>>(() => new Set(["FC", "FL", "CA", "PA", "EL", "CV"]));
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const draft = saved.data;
    if (!draft) return;
    const restoredRooms = draft.rooms as RoomDraft[];
    setPropertyType(draft.propertyType);
    setRooms(restoredRooms);
    setEnabledSections(new Set(draft.scopes));
    setLines(draft.lineItems.map((line, index) => {
      const room = restoredRooms.find((item) => item.label === line.roomName);
      const section = estimateBuilderSections.find((item) =>
        item.rows.some((row) => row.id === line.catalogueId)
      );
      const row = catalogueRows.find((item) => item.id === line.catalogueId);
      return {
        id: `${room?.id ?? `${line.roomName}-${index}`}:${line.catalogueId}`, catalogueId: line.catalogueId,
        sectionId: section?.id ?? "", sectionLabel: section?.label ?? "",
        roomName: line.roomName, specification: line.specification,
        options: row?.specifications ?? [line.specification], unit: line.unit,
        rate: line.rate, quantity: line.quantity, included: line.included
      };
    }));
    setActiveRoomId(restoredRooms[0]?.id ?? "");
    if (draft.lineItems.length) setTab("builder");
  }, [saved.data]);

  const totals = useMemo(() => calculateEstimateTotals(lines), [lines]);
  const persistedRooms = (saved.data?.rooms ?? []) as RoomDraft[];
  const designItemOptions = (saved.data?.lineItems ?? []).flatMap((line) => {
    if (!line.included) return [];
    const room = persistedRooms.find((item) => item.label === line.roomName);
    const section = estimateBuilderSections.find((candidate) =>
      candidate.rows.some((row) => row.id === line.catalogueId)
    );
    const row = section?.rows.find((candidate) => candidate.id === line.catalogueId);
    if (!room || !section || !row) return [];
    return [{
      roomId: room.id,
      catalogueId: line.catalogueId,
      label: `${line.catalogueId} · ${row.description}`,
      scopeLabel: section.label
    }];
  });
  const selectedLines = lines.filter((line) => line.included);
  const editable = !saved.data || ["draft", "designer_changes_requested", "client_changes_requested"].includes(saved.data.status);
  const draftInput = () => ({
    propertyType: propertyType || lead.data?.propertyType || "",
    rooms, scopes: Array.from(enabledSections),
    lineItems: lines.map(({ catalogueId, roomName, specification, unit, rate, quantity, included }) => ({ catalogueId, roomName, specification, unit, rate, quantity, included }))
  });
  const save = useMutation({
    mutationFn: () => saveLeadEstimate(leadId, draftInput()),
    onSuccess: () => { setNotice("Estimate draft saved."); void saved.refetch(); }
  });
  const submit = useMutation({
    mutationFn: async () => {
      await saveLeadEstimate(leadId, draftInput());
      return submitLeadEstimate(leadId);
    },
    onSuccess: (estimate) => {
      setNotice(estimate.approvalRequired
        ? "Submitted. A design manager must now assign a designer for approval."
        : "Submitted to the client portal for approval.");
      void saved.refetch();
    }
  });
  const sendToClient = useMutation({
    mutationFn: () => sendEstimateToClient(saved.data!.id),
    onSuccess: () => {
      setNotice("Estimate sent to the client portal and email notification queued.");
      void saved.refetch();
    }
  });

  if (lead.isPending || saved.isPending) return <AsyncState state="loading" message="Loading estimate…" />;
  if (lead.isError) return <AsyncState state="error" message="We couldn't load this lead." actionLabel="Try again" onAction={() => void lead.refetch()} />;
  const leadItem = lead.data;

  const addRoom = (definition: typeof roomDefinitions[number]) => {
    const count = rooms.filter((room) => room.typeId === definition.typeId).length;
    const room = { id: `${definition.typeId}-${Date.now()}`, typeId: definition.typeId, label: `${definition.label}${count ? ` ${count + 1}` : ""}`, icon: definition.icon, sqft: definition.sqft, length: null, width: null };
    setRooms((current) => [...current, room]);
  };
  const updateRoom = (id: string, change: Partial<RoomDraft>) => setRooms((current) => current.map((room) => {
    if (room.id !== id) return room;
    const next = { ...room, ...change };
    if (next.length && next.width) next.sqft = Math.round(next.length * next.width);
    return next;
  }));
  const buildLines = () => {
    const next = rooms.flatMap((room) => estimateBuilderSections
      .filter((section) => enabledSections.has(section.id))
      .flatMap((section) => section.rows.map((row) => {
        const specification = row.specifications[0];
        return {
          id: `${room.id}:${row.id}`, catalogueId: row.id, sectionId: section.id,
          sectionLabel: section.label, roomName: room.label, specification,
          options: row.specifications, unit: row.unit,
          rate: resolveRate({ baseRate: row.baseRate, rates: row.rates }, specification),
          quantity: defaultQuantity(row.quantityBasis as QuantityBasis, { sqft: room.sqft, length: room.length, width: room.width }),
          included: false
        };
      })));
    const prior = new Map(lines.map((line) => [line.id, line]));
    setLines(next.map((line) => prior.get(line.id) ?? line));
    setActiveRoomId(rooms[0]?.id ?? "");
    setTab("builder");
  };
  const updateLine = (id: string, change: Partial<LineDraft>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...change } : line));
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0];
  const activeLines = activeRoom ? lines.filter((line) => line.roomName === activeRoom.label) : [];
  const roomTotal = (roomName: string) => lines.filter((line) => line.roomName === roomName && line.included).reduce((sum, line) => sum + Math.round(line.quantity * line.rate), 0);

  return <section className="estimate-workspace" aria-labelledby="estimate-title">
    <Link to={`/estimator-sales/leads/${leadId}`} className="estimate-workspace__back">← Back to {leadItem.clientName}</Link>
    <header className="estimate-workspace__header"><div><p className="eyebrow">Estimate draft · {leadItem.clientName}</p><h1 id="estimate-title">{tab === "configure" ? "Configure estimate" : "Select estimate items"}</h1><p>{leadItem.projectName} · {leadItem.location}</p></div><div className="estimate-workspace__summary"><strong>{money(totals.total)}</strong><span>Total including GST</span></div></header>
    {saved.data ? <EstimateDesignUploads estimateId={saved.data.id} rooms={persistedRooms.map((room) => ({ id: room.id, label: room.label }))} scopes={estimateBuilderSections.filter((section) => saved.data!.scopes.includes(section.id)).map((section) => ({ id: section.id, label: section.label }))} items={designItemOptions} /> : null}
    {tab !== "configure" ? <nav className="estimate-tabs" aria-label="Estimate views">{(["builder", "summary", "proposal"] as const).map((value) => <button type="button" className={tab === value ? "is-active" : ""} onClick={() => setTab(value)} key={value}>{value === "builder" ? "📋 Estimate Builder" : value === "summary" ? "📊 Summary" : "📄 Proposal"}</button>)}<button type="button" onClick={() => setTab("configure")}>⚙ Rooms</button></nav> : null}
    {tab === "configure" ? <><section className="estimate-panel"><h2>Property type</h2><div className="estimate-chip-grid">{propertyTypes.map((type) => <button type="button" className={`estimate-chip ${(propertyType || leadItem.propertyType) === type ? "estimate-chip--active" : ""}`} onClick={() => setPropertyType(type)} key={type}>{type}</button>)}</div><h2>Rooms</h2><div className="estimate-room-grid">{roomDefinitions.map((definition) => <button type="button" className="estimate-room" onClick={() => addRoom(definition)} key={definition.typeId}>{definition.icon} {definition.label}</button>)}</div>{rooms.length ? <div className="estimate-dimensions">{rooms.map((room) => <div className="estimate-dimension-row" key={room.id}><span>{room.icon} <strong>{room.label}</strong></span><div><label>Length<input aria-label={`${room.label} length`} type="number" value={room.length ?? ""} onChange={(event) => updateRoom(room.id, { length: Number(event.target.value) || null })} placeholder="L ft" /></label><span>×</span><label>Width<input aria-label={`${room.label} width`} type="number" value={room.width ?? ""} onChange={(event) => updateRoom(room.id, { width: Number(event.target.value) || null })} placeholder="W ft" /></label><b>{room.sqft} sqft</b><button type="button" aria-label={`Remove ${room.label}`} onClick={() => setRooms((current) => current.filter((item) => item.id !== room.id))}>×</button></div></div>)}</div> : null}</section><section className="estimate-panel"><h2>Scope sections</h2><div className="estimate-scope-list">{estimateBuilderSections.map((section) => <label className={`estimate-scope ${enabledSections.has(section.id) ? "estimate-scope--active" : ""}`} key={section.id}><span>{section.icon}</span><span><strong>{section.label}</strong><small>{scopeDescriptions[section.id]}</small></span><input type="checkbox" checked={enabledSections.has(section.id)} onChange={() => setEnabledSections((current) => { const next = new Set(current); next.has(section.id) ? next.delete(section.id) : next.add(section.id); return next; })} /><i>{enabledSections.has(section.id) ? "On" : "Off"}</i></label>)}</div></section><button type="button" className="button button--primary estimate-continue" disabled={!rooms.length || !enabledSections.size} onClick={buildLines}>Continue to item selection →</button></> : null}
    {tab === "builder" ? <div className="estimate-builder-layout"><aside className="estimate-room-sidebar">{rooms.map((room) => <button type="button" className={activeRoom?.id === room.id ? "is-active" : ""} onClick={() => setActiveRoomId(room.id)} key={room.id}><span>{room.icon} {room.label}</span><small>{room.sqft} sqft · {money(roomTotal(room.label))}</small></button>)}</aside><section className="estimate-panel estimate-builder"><header><h2>{activeRoom?.icon} {activeRoom?.label}</h2><span>{activeLines.filter((line) => line.included).length} items selected</span></header>{estimateBuilderSections.filter((section) => enabledSections.has(section.id)).map((section) => <div className="estimate-builder-section" key={section.id}><h3>{section.icon} {section.label}<span>{money(activeLines.filter((line) => line.sectionId === section.id && line.included).reduce((sum, line) => sum + Math.round(line.quantity * line.rate), 0))}</span></h3>{activeLines.filter((line) => line.sectionId === section.id).map((line) => <div className={`estimate-line ${line.included ? "estimate-line--included" : ""}`} key={line.id}><label><input type="checkbox" disabled={!editable} checked={line.included} onChange={() => updateLine(line.id, { included: !line.included })} /><span><strong>{line.catalogueId} · {section.rows.find((row) => row.id === line.catalogueId)?.description}</strong><small>{money(line.rate)} per {line.unit}</small></span></label><select disabled={!editable} aria-label={`${line.catalogueId} specification`} value={line.specification} onChange={(event) => { const row = section.rows.find((item) => item.id === line.catalogueId)!; updateLine(line.id, { specification: event.target.value, rate: resolveRate({ baseRate: row.baseRate, rates: row.rates }, event.target.value) }); }}>{line.options.map((option) => <option key={option}>{option}</option>)}</select><input disabled={!editable} aria-label={`${line.catalogueId} quantity`} type="number" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) || 0 })} /><span>{line.unit}</span><strong>{line.included ? money(Math.round(line.quantity * line.rate)) : "—"}</strong></div>)}</div>)}</section></div> : null}
    {tab === "summary" ? <section className="estimate-panel estimate-summary"><h2>Estimate summary</h2>{rooms.map((room) => <div className="estimate-summary-row" key={room.id}><span>{room.icon} <strong>{room.label}</strong><small>{lines.filter((line) => line.roomName === room.label && line.included).length} selected items</small></span><strong>{money(roomTotal(room.label))}</strong></div>)}<div className="estimate-total-card"><span>Sub-total <strong>{money(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{money(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{money(totals.total)}</strong></span></div></section> : null}
    {tab === "proposal" ? <section className="estimate-panel estimate-proposal"><header><p className="eyebrow">Lisno interior proposal</p><h2>{leadItem.projectName}</h2><p>Prepared for {leadItem.clientName}</p></header>{rooms.map((room) => <article key={room.id}><h3>{room.icon} {room.label}</h3>{selectedLines.filter((line) => line.roomName === room.label).map((line) => <div key={line.id}><span>{catalogueRows.find((row) => row.id === line.catalogueId)?.description}<small>{line.specification} · {line.quantity} {line.unit}</small></span><strong>{money(Math.round(line.quantity * line.rate))}</strong></div>)}</article>)}<div className="estimate-total-card"><span>Sub-total <strong>{money(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{money(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{money(totals.total)}</strong></span></div><p className="estimate-terms">Valid 30 days. Rates subject to material market changes. Final scope on site measurement. GST as applicable.</p></section> : null}
    {tab !== "configure" ? <footer className="estimate-workspace__footer"><div><strong>{money(totals.total)} total</strong><span>{selectedLines.length} selected line items across {rooms.length} rooms · {saved.data?.status?.replaceAll("_", " ") ?? "draft"}</span></div><div className="estimate-actions">{editable ? <button type="button" className="button button--secondary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button> : null}{editable ? <button type="button" className="button button--primary" disabled={!selectedLines.length || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit estimate"}</button> : null}{saved.data?.status === "ready_for_client" ? <button type="button" className="button button--primary" disabled={sendToClient.isPending} onClick={() => sendToClient.mutate()}>{sendToClient.isPending ? "Sending…" : "Send to client"}</button> : null}</div></footer> : null}
    {save.isError || submit.isError || sendToClient.isError ? <p className="estimate-notice estimate-notice--error" role="alert">The estimate action could not be completed. Check the current workflow state and try again.</p> : null}{notice ? <p className="estimate-notice" role="status">{notice}</p> : null}
  </section>;
}
