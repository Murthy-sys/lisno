import { ProjectChatNavigation } from "../messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Armchair, BarChart3, Bath, Bed, BedDouble, BedSingle, Briefcase, Building2, ChefHat, ClipboardList, DoorOpen, FileText, Hammer, Layers, Leaf, PanelTop, Paintbrush, Pencil, Settings, ShowerHead, Sofa, Utensils, Wrench, Zap } from "lucide-react";

import { ApiError } from "../../api/client";
import type { EstimateClientReviewSummary } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { clientKeys } from "../client/clientApi";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { calculateEstimateTotals, resolveRate } from "./estimateEngine";
import { estimateBuilderSections } from "./estimateBuilderCatalogue";
import { EstimateBuilder, type BuilderLine, type BuilderRoom, type BuilderSection } from "./EstimateBuilder";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import { buildConfiguredLines, configuredLineAmountPaise, configuredQuantityUnits, parseSellingRate, restoreConfiguredLine, type ConfiguredLineDraft } from "./configuredEstimate";
import { estimationCatalogueKeys, getEstimationCatalogue } from "./estimationCatalogueApi";
import { EstimateDeliveryStatus } from "./EstimateDeliveryStatus";
import { EstimateClientFeedback } from "./EstimateClientFeedback";
import { EstimatePlanChangeRequests } from "./EstimatePlanChangeRequests";
import { PropertyTypeDropdown } from "./PropertyTypeDropdown";
import { RoomsMultiSelectDropdown, type RoomGroup, type RoomOption } from "./RoomsMultiSelectDropdown";
import { RoomDimensionsAccordion } from "./RoomDimensionsAccordion";
import { getLead, getLeadEstimate, leadKeys, retryEstimateClientEmail, saveLeadEstimate, sendEstimateToClient, submitLeadEstimate, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
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
const moneyPaise = (value: number) => money(value / 100);
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
  return <LeadEstimateWorkspaceForLead key={leadId} leadId={leadId} />;
}

function LeadEstimateWorkspaceForLead({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: () => getLead(leadId) });
  const saved = useQuery({ queryKey: leadKeys.estimate(leadId), queryFn: () => getLeadEstimate(leadId), retry: false });
  const [catalogueRequested, setCatalogueRequested] = useState(false);
  const hasConfiguredSaved = Boolean(saved.data?.lineItems.some((line) => line.source === "configuration") || saved.data?.selectedMainBasketIds?.length);
  const configuredMode = !saved.data || hasConfiguredSaved || catalogueRequested;
  const catalogue = useQuery({
    queryKey: estimationCatalogueKeys.all,
    queryFn: getEstimationCatalogue,
    enabled: !saved.isPending && !(saved.isError && saved.data === undefined) && configuredMode,
    staleTime: 60_000,
    retry: false
  });
  const [tab, setTab] = useState<EstimateTab>("configure");
  const [propertyType, setPropertyType] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [enabledSections, setEnabledSections] = useState<Set<string>>(() => new Set(["FC", "FL", "CA", "PA", "EL", "CV"]));
  const [selectedMainBasketIds, setSelectedMainBasketIds] = useState<Set<string>>(() => new Set());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [configuredLines, setConfiguredLines] = useState<ConfiguredLineDraft[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [notice, setNotice] = useState("");
  const [retryError, setRetryError] = useState("");
  const skipSavedHydrationFor = useRef<EstimateDraft | null>(null);

  useEffect(() => {
    const draft = saved.data;
    if (draft && draft === skipSavedHydrationFor.current) {
      skipSavedHydrationFor.current = null;
      return;
    }
    if (!draft) {
      if (saved.isSuccess) {
        setPropertyType("");
        setRooms([]);
        setEnabledSections(new Set(["FC", "FL", "CA", "PA", "EL", "CV"]));
        setSelectedMainBasketIds(new Set());
        setLines([]);
        setConfiguredLines([]);
        setActiveRoomId("");
        setTab("configure");
      }
      return;
    }
    const restoredRooms = draft.rooms as RoomDraft[];
    setPropertyType(draft.propertyType);
    setRooms(restoredRooms);
    setEnabledSections(new Set(draft.scopes));
    setSelectedMainBasketIds(new Set(draft.selectedMainBasketIds ?? draft.lineItems.filter((line) => line.source === "configuration").map((line) => line.mainBasketId)));
    setConfiguredLines(draft.lineItems.filter((line) => line.source === "configuration").map(restoreConfiguredLine));
    setLines(draft.lineItems.filter((line) => line.source !== "configuration").map((line, index) => {
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
  }, [saved.data, saved.isSuccess]);

  useEffect(() => {
    if (!catalogue.data || !configuredMode || !rooms.length || !selectedMainBasketIds.size) return;
    setConfiguredLines((previous) => buildConfiguredLines(catalogue.data, rooms, selectedMainBasketIds, previous));
  }, [catalogue.data, configuredMode, rooms, selectedMainBasketIds]);

  const legacyTotals = useMemo(() => calculateEstimateTotals(lines), [lines]);
  const configuredSubtotalPaise = configuredLines.reduce((sum, line) => sum + (configuredLineAmountPaise(line) ?? 0), 0);
  const subtotalPaise = legacyTotals.subtotal * 100 + configuredSubtotalPaise;
  const gstPaise = configuredLines.some((line) => line.persistedId || line.included)
    ? Number((BigInt(subtotalPaise) * 18n + 50n) / 100n) : legacyTotals.gst * 100;
  const totals = { subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100 };
  const selectedLines = lines.filter((line) => line.included);
  const selectedConfiguredLines = configuredLines.filter((line) => line.included);
  const invalidConfiguredLines = configuredLines.filter((line) => line.included || line.persistedId).filter((line) => {
    const rate = parseSellingRate(line.rateInput);
    return rate.kind === "invalid" || configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included) === null;
  });
  const incompleteConfiguredLines = selectedConfiguredLines.filter((line) => parseSellingRate(line.rateInput).kind === "blank");
  const editable = !saved.data || ["draft", "designer_changes_requested", "client_changes_requested"].includes(saved.data.status);
  const draftInput = (): EstimateDraftInput => ({
    propertyType: propertyType || lead.data?.propertyType || "",
    rooms, scopes: lines.length ? Array.from(enabledSections) : [],
    selectedMainBasketIds: Array.from(selectedMainBasketIds),
    ...(configuredMode && typeof saved.data?.version === "number" ? { expectedVersion: saved.data.version } : {}),
    lineItems: [
      ...lines.map(({ catalogueId, roomName, specification, unit, rate, quantity, included }) => ({ source: "legacy" as const, catalogueId, roomName, specification, unit, rate, quantity, included })),
      ...configuredLines.filter((line) => line.included || line.persistedId).map((line) => ({
        source: "configuration" as const, id: line.persistedId, catalogueId: line.mainLineId,
        roomId: line.roomId, roomName: line.roomName, mainBasketId: line.mainBasketId,
        subBasketId: line.subBasketId, mainLineId: line.mainLineId, revisionId: line.revisionId,
        uomId: line.uomId, quantity: line.quantity, included: line.included,
        ratePaise: parseSellingRate(line.rateInput).paise
      }))
    ]
  });
  const refreshSubmittedEstimate = (estimate: EstimateDraft, submittedLeadId: string) => {
    queryClient.setQueryData<EstimateDraft>(leadKeys.estimate(submittedLeadId), (current) => ({
      ...estimate,
      clientFeedback: estimate.clientFeedback === undefined ? current?.clientFeedback : estimate.clientFeedback
    }));
    void queryClient.refetchQueries({ queryKey: leadKeys.estimate(submittedLeadId), exact: true });
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.client }),
      queryClient.invalidateQueries({ queryKey: clientKeys.projects }),
      queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
      queryClient.invalidateQueries({ queryKey: estimateWorkflowKeys.reviewQueue }),
      queryClient.invalidateQueries({ queryKey: [...leadKeys.all, "saved-estimates"] }),
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(submittedLeadId), exact: true })
    ]);
  };
  const rememberDraftSave = (estimate: EstimateDraft, submittedLeadId: string) => {
    const cached = queryClient.setQueryData<EstimateDraft>(leadKeys.estimate(submittedLeadId), (current) => ({
      ...estimate, clientFeedback: estimate.clientFeedback === undefined ? current?.clientFeedback : estimate.clientFeedback
    }));
    if (submittedLeadId !== leadId) return;
    skipSavedHydrationFor.current = cached ?? null;
    const savedLineIds = new Map(estimate.lineItems.filter((line) => line.source === "configuration")
      .map((line) => [`${line.roomId}\u0000${line.mainLineId}`, line.id]));
    setConfiguredLines((current) => current.map((line) => ({
      ...line, persistedId: savedLineIds.get(`${line.roomId}\u0000${line.mainLineId}`) ?? line.persistedId
    })));
  };
  const save = useMutation({
    mutationFn: () => saveLeadEstimate(leadId, draftInput()),
    onMutate: () => setNotice(""),
    onSuccess: (estimate) => {
      rememberDraftSave(estimate, leadId);
      submit.reset();
      setNotice("Estimate draft saved.");
      void queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all });
    }
  });
  const submit = useMutation({
    mutationFn: async () => {
      const submittedLeadId = leadId;
      const draft = await saveLeadEstimate(submittedLeadId, draftInput());
      rememberDraftSave(draft, submittedLeadId);
      return { estimate: await submitLeadEstimate(submittedLeadId), submittedLeadId };
    },
    onSuccess: ({ estimate, submittedLeadId }) => {
      save.reset();
      if (leadId === submittedLeadId) setNotice(estimate.approvalRequired
        ? "Submitted. A design manager must now assign a designer for approval."
        : publicationNotice("Submitted to the client portal for approval.", estimate.clientReview));
      refreshSubmittedEstimate(estimate, submittedLeadId);
    }
  });
  const sendToClient = useMutation({
    mutationFn: async () => {
      const submittedLeadId = leadId;
      return { estimate: await sendEstimateToClient(saved.data!.id), submittedLeadId };
    },
    onSuccess: ({ estimate, submittedLeadId }) => {
      if (leadId === submittedLeadId) setNotice(publicationNotice(
        "Estimate sent to the client portal for approval.",
        estimate.clientReview
      ));
      refreshSubmittedEstimate(estimate, submittedLeadId);
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
  if (saved.isError && saved.data === undefined) return <AsyncState state="error" message="We couldn't load the saved estimate. Retry before making changes." actionLabel="Retry estimate" onAction={() => void saved.refetch()} />;
  const leadItem = lead.data;

  const selectedRoomTypeIds = Array.from(new Set(rooms.map((room) => room.typeId)));
  const handleRoomsChange = (nextTypeIds: string[]) => {
    const nextSet = new Set(nextTypeIds);
    const currentSet = new Set(selectedRoomTypeIds);
    const added = nextTypeIds.filter((typeId) => !currentSet.has(typeId));
    const removed = selectedRoomTypeIds.filter((typeId) => !nextSet.has(typeId));
    if (!added.length && !removed.length) return;
    const removedRoomIds = new Set(rooms.filter((room) => removed.includes(room.typeId)).map((room) => room.id));
    const removedRoomNames = new Set(rooms.filter((room) => removedRoomIds.has(room.id)).map((room) => room.label));
    if (removedRoomIds.size) {
      setConfiguredLines((current) => current.filter((line) => !removedRoomIds.has(line.roomId)));
      setLines((current) => current.filter((line) => !removedRoomNames.has(line.roomName)));
    }
    setRooms((current) => {
      const remaining = current.filter((room) => !removed.includes(room.typeId));
      const additions = added.map((typeId) => {
        const definition = roomDefinitions.find((item) => item.typeId === typeId)!;
        return { id: `${definition.typeId}-${Date.now()}`, typeId: definition.typeId, label: definition.label, icon: definition.icon, sqft: definition.sqft, length: null, width: null };
      });
      return [...remaining, ...additions];
    });
  };
  const removeRoom = (id: string) => {
    const roomName = rooms.find((room) => room.id === id)?.label;
    setRooms((current) => current.filter((room) => room.id !== id));
    setConfiguredLines((current) => current.filter((line) => line.roomId !== id));
    if (roomName) setLines((current) => current.filter((line) => line.roomName !== roomName));
    if (activeRoomId === id) setActiveRoomId(rooms.find((room) => room.id !== id)?.id ?? "");
  };
  const updateRoom = (id: string, change: Partial<RoomDraft>) => setRooms((current) => current.map((room) => {
    if (room.id !== id) return room;
    const next = { ...room, ...change };
    if (next.length && next.width) next.sqft = Math.round(next.length * next.width);
    return next;
  }));
  const toggleMainBasket = (id: string) => {
    if (selectedMainBasketIds.has(id)) {
      setConfiguredLines((prior) => prior.map((line) => line.mainBasketId === id ? { ...line, included: false } : line));
    }
    setSelectedMainBasketIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const buildLines = () => {
    if (!catalogue.data) return;
    setCatalogueRequested(true);
    setConfiguredLines((previous) => buildConfiguredLines(catalogue.data, rooms, selectedMainBasketIds, previous));
    setActiveRoomId(rooms[0]?.id ?? "");
    setTab("builder");
  };
  const updateLine = (id: string, change: Partial<LineDraft>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...change } : line));
  const updateConfiguredLine = (key: string, change: Partial<ConfiguredLineDraft>) => setConfiguredLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
  const roomTotalPaise = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    const legacy = lines.filter((line) => line.roomName === room?.label && line.included).reduce((sum, line) => sum + Math.round(line.quantity * line.rate) * 100, 0);
    const configured = configuredLines.filter((line) => line.roomId === roomId).reduce((sum, line) => sum + (configuredLineAmountPaise(line) ?? 0), 0);
    return legacy + configured;
  };
  const roomTotal = (roomName: string) => roomTotalPaise(rooms.find((room) => room.label === roomName)?.id ?? "") / 100;
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
  const includedItemCount = selectedLines.length + selectedConfiguredLines.length;
  const hasInvalidInput = invalidConfiguredLines.length > 0;
  const hasMissingRate = incompleteConfiguredLines.length > 0;
  const estimateVersionConflict = [save.error, submit.error].some((error) =>
    error instanceof ApiError && error.code === "ESTIMATE_VERSION_CONFLICT"
  );
  const reloadSavedEstimate = async () => {
    const result = await saved.refetch();
    if (result.isSuccess) {
      save.reset();
      submit.reset();
      setNotice("Latest saved estimate loaded.");
    }
  };

  return <section className="estimate-workspace estimator-dashboard" aria-labelledby="estimate-title">
    {tab === "configure" ? <Link to={`/estimator-sales/leads/${leadId}`} className="estimate-workspace__back lead-detail__back-link"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>Back to {leadItem.clientName}</Link> : <button type="button" onClick={() => setTab("configure")} className="estimate-workspace__back lead-detail__back-link"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>Back to {leadItem.clientName}</button>}
    <header className="estimate-workspace__header"><div><p className="eyebrow">Estimate draft · {leadItem.clientName}</p><h1 id="estimate-title">{tab === "configure" ? "Configure estimate" : "Select estimate items"}</h1><p>{leadItem.projectName} · {leadItem.location}</p></div><div className="estimate-workspace__summary"><strong>{money(totals.total)}</strong><span>Total including GST{hasMissingRate ? " · incomplete" : ""}</span></div></header>
    {leadItem.projectId && (!saved.data?.projectId || saved.data.projectId === leadItem.projectId) ? <ProjectChatNavigation projectId={leadItem.projectId} overviewTo={`/estimator-sales/leads/${leadId}/estimate`} overviewLabel="Estimate" /> : null}
    {saved.data?.clientReview ? <EstimateDeliveryStatus review={saved.data.clientReview} retrying={retryEmail.isPending} onRetry={() => retryEmail.mutate()} /> : null}
    {saved.data?.clientFeedback ? <EstimateClientFeedback feedback={saved.data.clientFeedback} editable={editable} refreshing={saved.isFetching} refreshFailed={saved.isRefetchError} onRefresh={() => void saved.refetch()} /> : null}
    {saved.data?.status === "client_changes_requested" ? <EstimatePlanChangeRequests estimateId={saved.data.id} /> : null}
    {tab !== "configure" ? <nav aria-label="Estimate views" className="grid grid-cols-3 gap-2">{(["builder", "summary", "proposal"] as const).map((value) => { const active = tab === value; return <button type="button" key={value} onClick={() => setTab(value)} aria-pressed={active} className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "border border-[var(--color-primary)]/20 bg-[var(--color-bg)] text-[var(--color-primary)]"}`}><TabIcon tab={value} /> {value === "builder" ? "Estimate Builder" : value === "summary" ? "Summary" : "Proposal"}</button>; })}</nav> : null}
    {tab === "configure" ? <>
      <section className="estimate-panel"><h2>Property type</h2><PropertyTypeDropdown options={propertyTypes} value={propertyType || leadItem.propertyType} onChange={setPropertyType} /><h2>Rooms</h2><RoomsMultiSelectDropdown options={roomSelectOptions} selected={selectedRoomTypeIds} onChange={handleRoomsChange} />{rooms.length ? <RoomDimensionsAccordion rooms={rooms.map((room) => ({ id: room.id, label: room.label, icon: roomIcons[room.typeId] ?? Pencil, length: room.length, width: room.width }))} onDimensionChange={updateRoom} onRemove={removeRoom} /> : null}</section>
      <section className="estimate-panel configured-estimate-chooser" aria-label="Configured Main Baskets">
        <div className="configured-estimate-chooser__heading"><div><p className="eyebrow">Configuration</p><h2>Main Baskets</h2><p>Select the Main Baskets for this estimate. Their Sub Baskets and Main Lines appear in the builder.</p></div></div>
        {!configuredMode ? <div className="configured-estimate-chooser__state"><p>This estimate contains historical items. You can keep editing them, or add current configured Main Lines.</p><button type="button" className="button button--secondary" onClick={() => setCatalogueRequested(true)}>Load configured baskets</button></div> : null}
        {configuredMode && catalogue.isPending ? <p role="status">Loading configured baskets…</p> : null}
        {configuredMode && catalogue.isError ? <div className="configured-estimate-chooser__state" role="alert"><p>{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? "You do not have permission to read the estimator catalogue." : "Configured baskets could not be loaded. Try again before selecting items."}</p>{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? null : <button type="button" className="button button--secondary" onClick={() => void catalogue.refetch()}>Retry catalogue</button>}</div> : null}
        {configuredMode && catalogue.data && !catalogue.data.items.length ? <p className="configured-estimate-chooser__state">No eligible Main Baskets are configured. Ask the Configuration administrator to activate a Main Basket, Sub Basket, Main Line and UOM.</p> : null}
        {configuredMode && catalogue.data?.ineligibleLineCount ? <p className="configured-estimate-chooser__note">{catalogue.data.ineligibleLineCount} configured Main {catalogue.data.ineligibleLineCount === 1 ? "Line is" : "Lines are"} unavailable here because {catalogue.data.ineligibleLineCount === 1 ? "it needs" : "they need"} an active Sub Basket, revision or UOM.</p> : null}
        {configuredMode && catalogue.data ? <div className="configured-estimate-chooser__list">{catalogue.data.items.map((basket) => {
          const lineCount = basket.subBaskets.reduce((sum, subBasket) => sum + subBasket.mainLines.length, 0);
          return <label className="configured-estimate-chooser__item" key={basket.id}><input type="checkbox" checked={selectedMainBasketIds.has(basket.id)} disabled={!editable || !lineCount} onChange={() => toggleMainBasket(basket.id)} /><span><strong>{basket.name}</strong><small>{basket.subBaskets.length} Sub {basket.subBaskets.length === 1 ? "Basket" : "Baskets"} · {lineCount} Main {lineCount === 1 ? "Line" : "Lines"}</small></span></label>;
        })}</div> : null}
      </section>
      {!configuredMode && lines.length ? <button type="button" className="button button--secondary estimate-continue" onClick={() => setTab("builder")}>Return to saved items</button> : null}
      {configuredMode ? <button type="button" className="button button--primary estimate-continue" disabled={!rooms.length || !selectedMainBasketIds.size || !catalogue.data || !editable} onClick={buildLines}>Continue to item selection</button> : null}
    </> : null}
    {tab === "builder" && configuredMode && (catalogue.data || hasConfiguredSaved) ? <>
      {!catalogue.data ? <p className="estimate-notice" role="status">Current Configuration is unavailable. Saved lines are shown from this estimate's snapshot.</p> : null}
      <ConfiguredEstimateBuilder
      rooms={builderRooms}
      activeRoomId={activeRoomId}
      onSelectRoom={setActiveRoomId}
      catalogue={catalogue.data ?? { items: [], ineligibleLineCount: 0 }}
      selectedMainBasketIds={selectedMainBasketIds}
      lines={configuredLines}
      onUpdateLine={updateConfiguredLine}
      roomTotal={roomTotalPaise}
      roomIcons={roomIcons}
      moneyPaise={moneyPaise}
      editable={editable}
    /></> : null}
    {tab === "builder" && configuredMode && catalogue.isError && !hasConfiguredSaved ? <p role="alert" className="estimate-notice estimate-notice--error">Configured items are unavailable. Return to configuration and retry.</p> : null}
    {tab === "builder" && lines.length ? <section aria-label="Earlier catalogue items"><h2>Earlier catalogue items</h2><EstimateBuilder
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
    /></section> : null}
    {tab === "summary" ? <section className="estimate-panel estimate-summary"><h2>Estimate summary</h2>{rooms.map((room) => <div className="estimate-summary-row" key={room.id}><span><RoomIcon typeId={room.typeId} /> <strong>{room.label}</strong><small>{lines.filter((line) => line.roomName === room.label && line.included).length + configuredLines.filter((line) => line.roomId === room.id && line.included).length} selected items</small></span><strong>{moneyPaise(roomTotalPaise(room.id))}</strong></div>)}{hasMissingRate ? <p role="status">Total incomplete: enter the selling rate for {incompleteConfiguredLines.length} selected Main Lines.</p> : null}<div className="estimate-total-card"><span>Sub-total <strong>{money(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{money(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{money(totals.total)}</strong></span></div></section> : null}
    {tab === "proposal" ? <section className="estimate-panel estimate-proposal"><header><p className="eyebrow">Lisno interior proposal</p><h2>{leadItem.projectName}</h2><p>Prepared for {leadItem.clientName}</p></header>{rooms.map((room) => <article key={room.id}><h3><RoomIcon typeId={room.typeId} /> {room.label}</h3>{selectedLines.filter((line) => line.roomName === room.label).map((line) => <div key={line.id}><span>{catalogueRows.find((row) => row.id === line.catalogueId)?.description ?? line.catalogueId}<small>{line.specification} · {line.quantity} {line.unit}</small></span><strong>{money(Math.round(line.quantity * line.rate))}</strong></div>)}{selectedConfiguredLines.filter((line) => line.roomId === room.id).map((line) => <div key={line.key}><span>{line.mainLineName}<small>{line.mainBasketName} / {line.subBasketName} · {line.quantity} {line.uomName} · {parseSellingRate(line.rateInput).kind === "blank" ? "Rate required" : `₹${line.rateInput} per ${line.uomName}`}</small></span><strong>{configuredLineAmountPaise(line) === null ? "Incomplete" : moneyPaise(configuredLineAmountPaise(line) ?? 0)}</strong></div>)}</article>)}{hasMissingRate ? <p role="status">This proposal is incomplete until every selected Main Line has a selling rate.</p> : null}<div className="estimate-total-card"><span>Sub-total <strong>{money(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{money(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{money(totals.total)}</strong></span></div><p className="estimate-terms">Valid for 30 days. Rates subject to material market changes. Final scope on site measurement. GST as applicable.</p></section> : null}
    {tab !== "configure" ? <footer className="estimate-workspace__footer"><div><strong>{money(totals.total)} total{hasMissingRate ? " · incomplete" : ""}</strong><span>{includedItemCount} selected line {includedItemCount === 1 ? "item" : "items"} across {rooms.length} {rooms.length === 1 ? "room" : "rooms"} · {saved.data?.status?.replaceAll("_", " ") ?? "draft"}</span></div><div className="estimate-actions">{editable ? <button type="button" className="button button--secondary" disabled={save.isPending || submit.isPending || hasInvalidInput || estimateVersionConflict} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button> : null}{editable ? <button type="button" className="button button--primary estimate-continue" disabled={!includedItemCount || hasInvalidInput || hasMissingRate || save.isPending || submit.isPending || estimateVersionConflict} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit estimate"}</button> : null}{saved.data?.status === "ready_for_client" ? <button type="button" className="button button--primary" disabled={sendToClient.isPending} onClick={() => sendToClient.mutate()}>{sendToClient.isPending ? "Sending…" : "Send to client"}</button> : null}</div></footer> : null}
    {hasInvalidInput ? <p className="estimate-notice estimate-notice--error" role="alert">Correct the highlighted rate or quantity before saving.</p> : null}
    {estimateVersionConflict ? <div className="estimate-notice estimate-notice--error" role="alert"><p>This estimate changed elsewhere. Reload the latest saved estimate before editing it again.</p><button type="button" className="button button--secondary" onClick={() => void reloadSavedEstimate()}>Reload saved estimate (discard edits)</button></div> : save.isError && save.error instanceof ApiError && save.error.code === "ESTIMATE_CATALOGUE_CHANGED" ? <div className="estimate-notice estimate-notice--error" role="alert"><p>Configuration changed since you opened this estimate. Refresh the catalogue and check the selected lines before saving.</p><button type="button" className="button button--secondary" onClick={() => void catalogue.refetch()}>Refresh catalogue</button></div> : save.isError || submit.isError || sendToClient.isError ? <p className="estimate-notice estimate-notice--error" role="alert">The estimate action could not be completed. Check the current workflow state and try again.</p> : null}{retryError ? <p className="estimate-notice estimate-notice--error" role="alert">{retryError}</p> : null}{notice ? <p className="estimate-notice" role="status">{notice}</p> : null}
  </section>;
}
