import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Armchair, BarChart3, Bath, Bed, BedDouble, BedSingle, Briefcase, Building2, ChefHat, ClipboardList, DoorOpen, FileText, Hammer, Layers, Leaf, PanelTop, Paintbrush, Pencil, Settings, ShowerHead, Sofa, Utensils, Wrench, Zap } from "lucide-react";

import { ApiError } from "../../api/client";
import type { EstimateClientReviewSummary } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { calculateEstimateTotals, defaultQuantity, resolveRate, type QuantityBasis } from "./estimateEngine";
import { estimateBuilderSections } from "./estimateBuilderCatalogue";
import { EstimateBuilder, type BuilderLine, type BuilderRoom, type BuilderSection } from "./EstimateBuilder";
import { EstimateDeliveryStatus } from "./EstimateDeliveryStatus";
import { EstimatePlanChangeRequests } from "./EstimatePlanChangeRequests";
import { PropertyTypeDropdown } from "./PropertyTypeDropdown";
import { RoomsMultiSelectDropdown, type RoomGroup, type RoomOption } from "./RoomsMultiSelectDropdown";
import { RoomDimensionsAccordion } from "./RoomDimensionsAccordion";
import { ScopeSectionsToggleList, type ScopeSectionOption } from "./ScopeSectionsToggleList";
import { getLead, getLeadEstimate, leadKeys, retryEstimateClientEmail, saveLeadEstimate, sendEstimateToClient, submitLeadEstimate } from "./leadsApi";
import "../../styles/estimator-dashboard.css";

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
const roomIcons: Record<string, typeof Sofa> = {
  living: Sofa, master: BedDouble, bedroom2: Bed, bedroom3: BedSingle, kitchen: ChefHat,
  bath_m: Bath, bath_c: ShowerHead, balcony: Leaf, foyer: DoorOpen, study: Briefcase, custom: Pencil
};
const scopeIcons: Record<string, typeof Sofa> = {
  FC: PanelTop, FL: Layers, CA: Hammer, PA: Paintbrush, EL: Zap, CV: Wrench, LF: Armchair
};
const roomSelectIcons: Record<string, typeof Sofa> = {
  living: Sofa, master: Bed, bedroom2: Bed, bedroom3: Bed, kitchen: Utensils,
  bath_m: ShowerHead, bath_c: Bath, balcony: Leaf, foyer: DoorOpen, study: Building2, custom: Pencil
};
const roomSelectGroups: Record<string, RoomGroup> = {
  living: "Common Areas", kitchen: "Common Areas", balcony: "Common Areas", foyer: "Common Areas", study: "Common Areas",
  master: "Bedrooms", bedroom2: "Bedrooms", bedroom3: "Bedrooms",
  bath_m: "Bathrooms", bath_c: "Bathrooms",
  custom: "Other"
};
const roomSelectOptions: RoomOption[] = roomDefinitions.map((definition) => ({
  id: definition.typeId,
  label: definition.label,
  icon: roomSelectIcons[definition.typeId] ?? Pencil,
  group: roomSelectGroups[definition.typeId] ?? "Other"
}));
const scopeSectionOptions: ScopeSectionOption[] = estimateBuilderSections.map((section) => ({
  id: section.id,
  label: section.label,
  description: scopeDescriptions[section.id] ?? "",
  icon: scopeIcons[section.id] ?? PanelTop
}));
function RoomIcon({ typeId }: { typeId: string }) {
  const Icon = roomIcons[typeId] ?? Pencil;
  return <Icon size={16} aria-hidden="true" />;
}
const tabIcons: Record<EstimateTab, typeof Sofa> = {
  configure: Settings, builder: ClipboardList, summary: BarChart3, proposal: FileText
};
function TabIcon({ tab }: { tab: EstimateTab }) {
  const Icon = tabIcons[tab];
  return <Icon size={16} aria-hidden="true" />;
}
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
const deliveryCopy: Record<EstimateClientReviewSummary["deliveryStatus"], string> = {
  queued: "Email queued",
  sending: "Email sending",
  sent: "Email sent",
  failed: "Email delivery failed",
  disabled: "Email unavailable"
};
const publicationNotice = (
  portalCopy: string,
  review: EstimateClientReviewSummary | null | undefined
) => review ? `${portalCopy} ${deliveryCopy[review.deliveryStatus]}.` : portalCopy;

export function LeadEstimateWorkspace() {
  const { leadId = "" } = useParams();
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => getLead(leadId) });
  const saved = useQuery({ queryKey: leadKeys.estimate(leadId), queryFn: () => getLeadEstimate(leadId), retry: false });
  const [tab, setTab] = useState<EstimateTab>("configure");
  const [propertyType, setPropertyType] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [enabledSections, setEnabledSections] = useState<Set<string>>(() => new Set(["FC", "FL", "CA", "PA", "EL", "CV"]));
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [notice, setNotice] = useState("");
  const [retryError, setRetryError] = useState("");

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
        : publicationNotice("Submitted to the client portal for approval.", estimate.clientReview));
      void saved.refetch();
    }
  });
  const sendToClient = useMutation({
    mutationFn: () => sendEstimateToClient(saved.data!.id),
    onSuccess: (estimate) => {
      setNotice(publicationNotice(
        "Estimate sent to the client portal for approval.",
        estimate.clientReview
      ));
      void saved.refetch();
    }
  });
  const retryEmail = useMutation({
    mutationFn: () => {
      const estimate = saved.data;
      const review = estimate?.clientReview;
      if (!estimate || !review) throw new Error("No current Estimate email delivery exists.");
      return retryEstimateClientEmail(estimate.id, {
        roundId: review.id,
        version: review.version
      });
    },
    onMutate: () => {
      setNotice("");
      setRetryError("");
    },
    onSuccess: async () => {
      setNotice("Estimate email delivery updated.");
      await saved.refetch();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setRetryError("Email delivery changed. Refreshed the latest status.");
        await saved.refetch();
        return;
      }
      setRetryError("The estimate email could not be retried. Refresh and try again.");
    }
  });

  if (lead.isPending || saved.isPending) return <AsyncState state="loading" message="Loading estimate…" />;
  if (lead.isError) return <AsyncState state="error" message="We couldn't load this lead." actionLabel="Try again" onAction={() => void lead.refetch()} />;
  const leadItem = lead.data;

  const selectedRoomTypeIds = Array.from(new Set(rooms.map((room) => room.typeId)));
  const handleRoomsChange = (nextTypeIds: string[]) => {
    const nextSet = new Set(nextTypeIds);
    const currentSet = new Set(selectedRoomTypeIds);
    const added = nextTypeIds.filter((typeId) => !currentSet.has(typeId));
    const removed = selectedRoomTypeIds.filter((typeId) => !nextSet.has(typeId));
    if (!added.length && !removed.length) return;
    setRooms((current) => {
      const remaining = current.filter((room) => !removed.includes(room.typeId));
      const additions = added.map((typeId) => {
        const definition = roomDefinitions.find((item) => item.typeId === typeId)!;
        return { id: `${definition.typeId}-${Date.now()}`, typeId: definition.typeId, label: definition.label, icon: definition.icon, sqft: definition.sqft, length: null, width: null };
      });
      return [...remaining, ...additions];
    });
  };
  const removeRoom = (id: string) => setRooms((current) => current.filter((room) => room.id !== id));
  const updateRoom = (id: string, change: Partial<RoomDraft>) => setRooms((current) => current.map((room) => {
    if (room.id !== id) return room;
    const next = { ...room, ...change };
    if (next.length && next.width) next.sqft = Math.round(next.length * next.width);
    return next;
  }));
  const toggleScopeSection = (id: string) => setEnabledSections((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAllScopeSections = () => setEnabledSections(new Set(scopeSectionOptions.map((option) => option.id)));
  const deselectAllScopeSections = () => setEnabledSections(new Set());
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
  const roomTotal = (roomName: string) => lines.filter((line) => line.roomName === roomName && line.included).reduce((sum, line) => sum + Math.round(line.quantity * line.rate), 0);
  const builderRooms: BuilderRoom[] = rooms.map((room) => ({ id: room.id, typeId: room.typeId, label: room.label, sqft: room.sqft }));
  const builderSections: BuilderSection[] = estimateBuilderSections
    .filter((section) => enabledSections.has(section.id))
    .map((section) => ({ id: section.id, label: section.label, icon: scopeIcons[section.id] ?? PanelTop }));
  const builderLines: BuilderLine[] = lines.map((line) => ({
    id: line.id, catalogueId: line.catalogueId, sectionId: line.sectionId, roomName: line.roomName,
    description: catalogueRows.find((row) => row.id === line.catalogueId)?.description ?? "",
    specification: line.specification, options: line.options, unit: line.unit, rate: line.rate, quantity: line.quantity, included: line.included
  }));
  const handleBuilderLineUpdate = (id: string, change: { specification?: string; quantity?: number; included?: boolean }) => {
    if (change.specification !== undefined) {
      const line = lines.find((item) => item.id === id);
      const section = estimateBuilderSections.find((item) => item.id === line?.sectionId);
      const row = section?.rows.find((item) => item.id === line?.catalogueId);
      if (line && row) {
        updateLine(id, { specification: change.specification, rate: resolveRate({ baseRate: row.baseRate, rates: row.rates }, change.specification) });
        return;
      }
    }
    updateLine(id, change);
  };

  return <section className="estimate-workspace estimator-dashboard" aria-labelledby="estimate-title">
    {tab === "configure" ? <Link to={`/estimator-sales/leads/${leadId}`} className="estimate-workspace__back lead-detail__back-link"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>Back to {leadItem.clientName}</Link> : <button type="button" onClick={() => setTab("configure")} className="estimate-workspace__back lead-detail__back-link"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>Back to {leadItem.clientName}</button>}
    <header className="estimate-workspace__header"><div><p className="eyebrow">Estimate draft · {leadItem.clientName}</p><h1 id="estimate-title">{tab === "configure" ? "Configure estimate" : "Select estimate items"}</h1><p>{leadItem.projectName} · {leadItem.location}</p></div><div className="estimate-workspace__summary"><strong>{money(totals.total)}</strong><span>Total including GST</span></div></header>
    {saved.data?.clientReview ? <EstimateDeliveryStatus review={saved.data.clientReview} retrying={retryEmail.isPending} onRetry={() => retryEmail.mutate()} /> : null}
    {saved.data?.status === "client_changes_requested" ? <EstimatePlanChangeRequests estimateId={saved.data.id} /> : null}
    {tab !== "configure" ? <nav aria-label="Estimate views" className="grid grid-cols-3 gap-2">{(["builder", "summary", "proposal"] as const).map((value) => { const active = tab === value; return <button type="button" key={value} onClick={() => setTab(value)} className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${active ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "border border-[var(--color-primary)]/20 bg-[var(--color-bg)] text-[var(--color-primary)]"}`}><TabIcon tab={value} /> {value === "builder" ? "Estimate Builder" : value === "summary" ? "Summary" : "Proposal"}</button>; })}</nav> : null}
    {tab === "configure" ? <><section className="estimate-panel"><h2>Property type</h2><PropertyTypeDropdown options={propertyTypes} value={propertyType || leadItem.propertyType} onChange={setPropertyType} /><h2>Rooms</h2><RoomsMultiSelectDropdown options={roomSelectOptions} selected={selectedRoomTypeIds} onChange={handleRoomsChange} />{rooms.length ? <RoomDimensionsAccordion rooms={rooms.map((room) => ({ id: room.id, label: room.label, icon: roomIcons[room.typeId] ?? Pencil, length: room.length, width: room.width }))} onDimensionChange={updateRoom} onRemove={removeRoom} /> : null}</section><section className="estimate-panel"><h2>Scope sections</h2><ScopeSectionsToggleList options={scopeSectionOptions} enabled={enabledSections} onToggle={toggleScopeSection} onSelectAll={selectAllScopeSections} onDeselectAll={deselectAllScopeSections} /></section><button type="button" className="button button--primary estimate-continue" disabled={!rooms.length || !enabledSections.size} onClick={buildLines}>Continue to item selection<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg></button></> : null}
    {tab === "builder" ? <EstimateBuilder
      rooms={builderRooms}
      activeRoomId={activeRoomId}
      onSelectRoom={setActiveRoomId}
      sections={builderSections}
      roomIcons={roomIcons}
      lines={builderLines}
      onUpdateLine={handleBuilderLineUpdate}
      roomTotal={roomTotal}
      money={money}
      editable={editable}
    /> : null}
    {tab === "summary" ? <section className="estimate-panel estimate-summary"><h2>Estimate summary</h2>{rooms.map((room) => <div className="estimate-summary-row" key={room.id}><span><RoomIcon typeId={room.typeId} /> <strong>{room.label}</strong><small>{lines.filter((line) => line.roomName === room.label && line.included).length} selected items</small></span><strong>{money(roomTotal(room.label))}</strong></div>)}<div className="estimate-total-card"><span>Sub-total <strong>{money(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{money(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{money(totals.total)}</strong></span></div></section> : null}
    {tab === "proposal" ? <section className="estimate-panel estimate-proposal"><header><p className="eyebrow">Lisno interior proposal</p><h2>{leadItem.projectName}</h2><p>Prepared for {leadItem.clientName}</p></header>{rooms.map((room) => <article key={room.id}><h3><RoomIcon typeId={room.typeId} /> {room.label}</h3>{selectedLines.filter((line) => line.roomName === room.label).map((line) => <div key={line.id}><span>{catalogueRows.find((row) => row.id === line.catalogueId)?.description}<small>{line.specification} · {line.quantity} {line.unit}</small></span><strong>{money(Math.round(line.quantity * line.rate))}</strong></div>)}</article>)}<div className="estimate-total-card"><span>Sub-total <strong>{money(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{money(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{money(totals.total)}</strong></span></div><p className="estimate-terms">Valid for 30 days. Rates subject to material market changes. Final scope on site measurement. GST as applicable.</p></section> : null}
    {tab !== "configure" ? <footer className="estimate-workspace__footer"><div><strong>{money(totals.total)} total</strong><span>{selectedLines.length} selected line items across {rooms.length} rooms · {saved.data?.status?.replaceAll("_", " ") ?? "draft"}</span></div><div className="estimate-actions">{editable ? <button type="button" className="button button--secondary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button> : null}{editable ? <button type="button" className="button button--primary estimate-continue" disabled={!selectedLines.length || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit estimate"}</button> : null}{saved.data?.status === "ready_for_client" ? <button type="button" className="button button--primary" disabled={sendToClient.isPending} onClick={() => sendToClient.mutate()}>{sendToClient.isPending ? "Sending…" : "Send to client"}</button> : null}</div></footer> : null}
    {save.isError || submit.isError || sendToClient.isError ? <p className="estimate-notice estimate-notice--error" role="alert">The estimate action could not be completed. Check the current workflow state and try again.</p> : null}{retryError ? <p className="estimate-notice estimate-notice--error" role="alert">{retryError}</p> : null}{notice ? <p className="estimate-notice" role="status">{notice}</p> : null}
  </section>;
}
