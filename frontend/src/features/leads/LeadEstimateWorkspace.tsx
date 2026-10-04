import { ProjectChatNavigation } from "../messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Armchair, Bath, Bed, BedDouble, BedSingle, Briefcase, Building2, ChefHat, DoorOpen, Hammer, Layers, Leaf, PanelTop, Paintbrush, Pencil, ShowerHead, Sofa, Utensils, Wrench, Zap } from "lucide-react";

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
import { buildConfiguredLines, configuredLineAmountPaise, configuredLinePreviewAmountPaise, configuredQuantityUnits, parseSellingRate, restoreConfiguredLine, type ConfiguredLineDraft } from "./configuredEstimate";
import { estimationCatalogueKeys, getEstimationCatalogue, getEstimationCatalogueRecommendations, type EstimationCatalogueBasket } from "./estimationCatalogueApi";
import { buildRoomRecommendations, partitionRoomRecommendationSources, recommendationSourceIdentity, type RecommendationDecision, type RecommendedLineTarget } from "./roomRecommendations";
import { EstimateDeliveryStatus } from "./EstimateDeliveryStatus";
import { EstimateClientFeedback } from "./EstimateClientFeedback";
import { EstimatePlanChangeRequests } from "./EstimatePlanChangeRequests";
import { PropertyTypeDropdown } from "./PropertyTypeDropdown";
import { RoomsMultiSelectDropdown, type RoomGroup, type RoomOption } from "./RoomsMultiSelectDropdown";
import { RoomDimensionsAccordion } from "./RoomDimensionsAccordion";
import { getLead, getLeadEstimate, leadKeys, retryEstimateClientEmail, saveLeadEstimate, sendEstimateToClient, submitLeadEstimate, type ConfiguredEstimateLine, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
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
function basketCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}
function MainBasketSelectionRow({ basket, selected, disabled, onToggle }: {
  basket: EstimationCatalogueBasket;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `estimate-basket-details-${basket.id}`;
  const mainLineCount = basket.subBaskets.reduce((sum, item) => sum + item.mainLines.length, 0);
  const temporaryCount = (basket.directTemporaryItems ?? []).length + basket.subBaskets.reduce((sum, item) => sum + (item.temporaryItems ?? []).length, 0);
  return <div className={`configured-estimate-chooser__item${selected ? " configured-estimate-chooser__item--selected" : ""}`}>
    <div className="configured-estimate-chooser__row">
      <label className="configured-estimate-chooser__selection">
        <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle} />
        <span className="configured-estimate-chooser__glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></svg></span>
        <strong>{basket.name}</strong>
        <span className="sr-only">{basketCount(basket.subBaskets.length, "Sub Basket", "Sub Baskets")} · {basketCount(mainLineCount, "Main Line", "Main Lines")} · {basketCount(temporaryCount, "temporary item", "temporary items")}</span>
      </label>
      <div className="configured-estimate-chooser__counts">
        <span>{basketCount(basket.subBaskets.length, "Sub Basket", "Sub Baskets")}</span>
        <span>{basketCount(mainLineCount, "Main Line", "Main Lines")}</span>
        <span>{basketCount(temporaryCount, "Temporary Item", "Temporary Items")}</span>
      </div>
      <button type="button" className="configured-estimate-chooser__disclosure" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Hide" : "Show"} ${basket.name} details`} onClick={() => setExpanded((current) => !current)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
      </button>
    </div>
    <div id={detailsId} className="configured-estimate-chooser__details" hidden={!expanded}>
      {basket.subBaskets.map((subBasket) => <div key={subBasket.id} className="configured-estimate-chooser__detail"><strong>{subBasket.name}</strong><span>{basketCount(subBasket.mainLines.length, "Main Line", "Main Lines")} · {basketCount((subBasket.temporaryItems ?? []).length, "Temporary Item", "Temporary Items")}</span></div>)}
      {(basket.directTemporaryItems ?? []).length ? <div className="configured-estimate-chooser__detail"><strong>Directly under Main Basket</strong><span>{basketCount(basket.directTemporaryItems?.length ?? 0, "Temporary Item", "Temporary Items")}</span></div> : null}
      {!basket.subBaskets.length && !temporaryCount ? <p>No available items in this basket yet.</p> : null}
    </div>
  </div>;
}
function TabIcon({ tab }: { tab: EstimateTab }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab === "builder" ? <><rect x="5" y="5" width="14" height="16" rx="1" /><path d="M9 5V3h6v2M9 10h6M9 14h6M9 18h4" /></> : tab === "summary" ? <><path d="M4 20V11M9 20V5M14 20v-8M19 20V8M3 20h18" /></> : tab === "proposal" ? <><path d="M6 2h9l4 4v16H6zM15 2v5h4M9 11h7M9 15h7M9 19h5" /></> : <circle cx="12" cy="12" r="8" />}</svg>;
}
type EstimateTab = "configure" | "builder" | "summary" | "proposal";
type PendingRecommendationSource = { roomId: string; lineKey: string; sourceMainLineId: string; sourceIdentity: string; sequence: number };
type AutomaticRecommendationContext = {
  roomId: string;
  sources: PendingRecommendationSource[];
  decisions: RecommendationDecision[];
  catalogueUpdatedAt: number;
};
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

function recommendedTargetIdentity(roomId: string, target: RecommendedLineTarget): string {
  return JSON.stringify([roomId, target.mainLineId, target.basketId, target.subBasketId]);
}

function sourceHasSelectedRecommendation(
  sourceMainLineId: string,
  roomId: string,
  decisions: readonly RecommendationDecision[],
  currentLines: readonly ConfiguredLineDraft[],
  selectedDuringSlideOut: ReadonlySet<string>
): boolean {
  const included = new Set(currentLines.map((line) => recommendedTargetIdentity(roomId, {
    mainLineId: line.mainLineId, basketId: line.mainBasketId, subBasketId: line.subBasketId
  })));
  return decisions.some((decision) => {
    if (!decision.available || !decision.reasons.some((reason) => reason.sourceId === sourceMainLineId)) return false;
    const targets = decision.kind === "main_line"
      ? decision.target ? [decision.target] : []
      : decision.children.map((child) => child.target);
    return targets.some((target) => {
      const identity = recommendedTargetIdentity(roomId, target);
      return included.has(identity) || selectedDuringSlideOut.has(identity);
    });
  });
}

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
    queryKey: estimationCatalogueKeys.ready,
    queryFn: () => getEstimationCatalogue({ includeReadyNonActive: true }),
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
  const [recommendationDialogOpen, setRecommendationDialogOpen] = useState(false);
  const [pendingRecommendationSources, setPendingRecommendationSources] = useState<PendingRecommendationSource[]>([]);
  const automaticRecommendationContext = useRef<AutomaticRecommendationContext | null>(null);
  const selectedDuringSlideOut = useRef(new Set<string>());
  const recommendationSequence = useRef(0);
  const recommendationContext = useRef({ roomId: activeRoomId, tab });
  const [notice, setNotice] = useState("");
  const [retryError, setRetryError] = useState("");
  const skipSavedHydrationFor = useRef<EstimateDraft | null>(null);
  const cancelRecommendationOpening = () => {
    setPendingRecommendationSources([]);
    automaticRecommendationContext.current = null;
    selectedDuringSlideOut.current.clear();
    setRecommendationDialogOpen(false);
  };

  useEffect(() => {
    cancelRecommendationOpening();
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
  const recommendationSourcePartition = useMemo(() => catalogue.data
    ? partitionRoomRecommendationSources({ catalogue: catalogue.data, lines: configuredLines, roomId: activeRoomId })
    : { current: [], historical: [], outdatedDraft: false }, [catalogue.data, configuredLines, activeRoomId]);
  const recommendationSources = recommendationSourcePartition.current;
  const recommendationSourceIds = [...new Set(recommendationSources.map((line) => line.mainLineId))];
  const recommendationIdentity = recommendationSources.map(recommendationSourceIdentity).sort();
  const recommendations = useQuery({
    queryKey: estimationCatalogueKeys.recommendationSources(recommendationIdentity),
    queryFn: () => getEstimationCatalogueRecommendations(recommendationSourceIds),
    enabled: tab === "builder" && configuredMode && Boolean(catalogue.data) && !catalogue.isError && recommendationSourceIds.length > 0,
    staleTime: 60_000,
    retry: false
  });
  const recommendationView = useMemo(() => catalogue.data && (recommendations.data || !recommendationSourceIds.length)
    ? buildRoomRecommendations({ catalogue: catalogue.data, lines: configuredLines, roomId: activeRoomId,
      recommendations: recommendations.data ?? { sources: [] } })
    : null, [catalogue.data, configuredLines, activeRoomId, recommendations.data, recommendationSourceIds.length]);
  const recommendationState = catalogue.isError && catalogue.error instanceof ApiError && catalogue.error.status === 403
    ? "forbidden" as const
    : !catalogue.data || catalogue.isError || recommendationView?.stale
      ? "stale" as const
      : !recommendationSourceIds.length
        ? "ready" as const
        : recommendations.isError
        ? recommendations.error instanceof ApiError && recommendations.error.status === 403 ? "forbidden" as const : "error" as const
        : recommendations.isPending || recommendations.isFetching || catalogue.isFetching
          ? "loading" as const : "ready" as const;
  const incompleteSelectedConfiguredLines = selectedConfiguredLines.filter((line) => configuredLineAmountPaise(line) === null);
  const hasIncompleteConfiguredTotal = incompleteSelectedConfiguredLines.length > 0;
  const invalidSelectedAmountCount = incompleteSelectedConfiguredLines.filter((line) => parseSellingRate(line.rateInput).kind !== "blank").length;
  const invalidConfiguredLines = configuredLines.filter((line) => line.included || line.persistedId).filter((line) => {
    const rate = parseSellingRate(line.rateInput);
    const quantityUnits = configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included);
    return rate.kind === "invalid" || quantityUnits === null ||
      (rate.kind === "value" && quantityUnits > 0 && configuredLinePreviewAmountPaise(line) === null);
  });
  const incompleteConfiguredLines = selectedConfiguredLines.filter((line) => parseSellingRate(line.rateInput).kind === "blank");
  const unavailableNewConfiguredLines = selectedConfiguredLines.filter((line) => !line.persistedId && line.sourceMissing);
  const changedNewConfiguredLines = selectedConfiguredLines.filter((line) => !line.persistedId && line.sourceReview);
  const supportsExpandedCatalogue = catalogue.data?.readyNonActiveSupported === true;
  const legacyIncompatibleConfiguredLines = !supportsExpandedCatalogue
    ? configuredLines.filter((line) => (line.included || line.persistedId) && (line.itemType === "temporary" || line.subBasketId === null))
    : [];
  const editable = !saved.data || ["draft", "designer_changes_requested", "client_changes_requested"].includes(saved.data.status);
  useEffect(() => {
    const previous = recommendationContext.current;
    recommendationContext.current = { roomId: activeRoomId, tab };
    if (previous.roomId !== activeRoomId || previous.tab !== tab) {
      setRecommendationDialogOpen(false);
      setPendingRecommendationSources([]);
      automaticRecommendationContext.current = null;
      selectedDuringSlideOut.current.clear();
    }
  }, [activeRoomId, tab]);

  useEffect(() => {
    if (!automaticRecommendationContext.current) return;
    if (!editable || catalogue.isError || catalogue.isFetching ||
      recommendationState === "stale" || recommendationState === "error" || recommendationState === "forbidden" ||
      catalogue.dataUpdatedAt !== automaticRecommendationContext.current.catalogueUpdatedAt) {
      automaticRecommendationContext.current = null;
      selectedDuringSlideOut.current.clear();
    }
  }, [editable, catalogue.isError, catalogue.isFetching, catalogue.dataUpdatedAt, recommendationState]);

  useEffect(() => {
    if (!pendingRecommendationSources.length) return;
    if (tab !== "builder" || !editable || !activeRoomId) {
      setPendingRecommendationSources([]);
      return;
    }
    const activeEvents = pendingRecommendationSources.filter((event) => event.roomId === activeRoomId &&
      recommendationSources.some((source) => source.key === event.lineKey &&
        source.mainLineId === event.sourceMainLineId && recommendationSourceIdentity(source) === event.sourceIdentity));
    if (activeEvents.length !== pendingRecommendationSources.length) setPendingRecommendationSources(activeEvents);
    if (!activeEvents.length || recommendationState === "loading") return;
    const actionableEvents = recommendationState === "ready" && recommendationView ? activeEvents.filter((event) =>
      recommendationView.decisions.some((decision) => decision.available &&
        decision.reasons.some((reason) => reason.sourceId === event.sourceMainLineId) &&
        (decision.kind === "main_line"
          ? Boolean(decision.target && !decision.selected)
          : decision.children.some((child) => !child.selected)))) : [];
    if (actionableEvents.length && recommendationView) {
      automaticRecommendationContext.current = {
        roomId: activeRoomId, sources: actionableEvents, decisions: recommendationView.decisions,
        catalogueUpdatedAt: catalogue.dataUpdatedAt
      };
      selectedDuringSlideOut.current.clear();
      setRecommendationDialogOpen(true);
    }
    setPendingRecommendationSources([]);
  }, [activeRoomId, catalogue.dataUpdatedAt, editable, pendingRecommendationSources, recommendationSources, recommendationState, recommendationView, tab]);
  const draftInput = (): EstimateDraftInput => ({
    propertyType: propertyType || lead.data?.propertyType || "",
    rooms, scopes: lines.length ? Array.from(enabledSections) : [],
    selectedMainBasketIds: Array.from(selectedMainBasketIds),
    ...(configuredMode && typeof saved.data?.version === "number" ? { expectedVersion: saved.data.version } : {}),
    lineItems: [
      ...lines.map(({ catalogueId, roomName, specification, unit, rate, quantity, included }) => ({ source: "legacy" as const, catalogueId, roomName, specification, unit, rate, quantity, included })),
      ...configuredLines.filter((line) => line.included || line.persistedId).map((line) => ({
        source: "configuration" as const,
        ...(supportsExpandedCatalogue ? { itemType: line.itemType } : {}),
        id: line.persistedId, catalogueId: line.mainLineId,
        roomId: line.roomId, roomName: line.roomName, mainBasketId: line.mainBasketId,
        subBasketId: line.subBasketId, mainLineId: line.mainLineId, revisionId: line.revisionId,
        ...(supportsExpandedCatalogue && !line.persistedId && line.itemVersion !== undefined ? { itemVersion: line.itemVersion } : {}),
        ...(supportsExpandedCatalogue && !line.persistedId && line.revisionVersion !== undefined ? { revisionVersion: line.revisionVersion } : {}),
        uomId: line.uomId, quantity: line.quantity, included: line.included,
        ratePaise: parseSellingRate(line.rateInput).paise
      }))
    ]
  });
  const refreshSubmittedEstimate = (estimate: EstimateDraft, submittedLeadId: string) => {
    if (submittedLeadId === leadId) cancelRecommendationOpening();
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
    if (submittedLeadId === leadId) cancelRecommendationOpening();
    const cached = queryClient.setQueryData<EstimateDraft>(leadKeys.estimate(submittedLeadId), (current) => ({
      ...estimate, clientFeedback: estimate.clientFeedback === undefined ? current?.clientFeedback : estimate.clientFeedback
    }));
    if (submittedLeadId !== leadId) return;
    skipSavedHydrationFor.current = cached ?? null;
    const savedLines = new Map(estimate.lineItems
      .filter((line): line is ConfiguredEstimateLine => line.source === "configuration")
      .map((line) => [`${line.roomId}\u0000${line.mainLineId}`, line]));
    setConfiguredLines((current) => current.map((line) => {
      const stored = savedLines.get(`${line.roomId}\u0000${line.mainLineId}`);
      return stored ? {
        ...line,
        persistedId: stored.id,
        sourceItemStatus: stored.sourceItemStatus ?? line.sourceItemStatus,
        sourceRevisionStatus: stored.sourceRevisionStatus ?? line.sourceRevisionStatus,
        sourceItemVersion: stored.sourceItemVersion ?? line.sourceItemVersion,
        sourceRevisionVersion: stored.sourceRevisionVersion ?? line.sourceRevisionVersion
      } : line;
    }));
  };
  const save = useMutation({
    mutationFn: () => saveLeadEstimate(leadId, draftInput()),
    onMutate: () => {
      cancelRecommendationOpening();
      setNotice("");
    },
    onSuccess: (estimate) => {
      rememberDraftSave(estimate, leadId);
      submit.reset();
      setNotice("Estimate draft saved.");
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all }),
        queryClient.invalidateQueries({ queryKey: [...leadKeys.all, "saved-estimates"] }),
        queryClient.invalidateQueries({ queryKey: leadKeys.detail(leadId), exact: true })
      ]);
    }
  });
  const submit = useMutation({
    mutationFn: async () => {
      const submittedLeadId = leadId;
      const draft = await saveLeadEstimate(submittedLeadId, draftInput());
      rememberDraftSave(draft, submittedLeadId);
      return { estimate: await submitLeadEstimate(submittedLeadId), submittedLeadId };
    },
    onMutate: () => {
      cancelRecommendationOpening();
      setNotice("");
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
  const refreshAvailableItems = async () => {
    setPendingRecommendationSources([]);
    automaticRecommendationContext.current = null;
    selectedDuringSlideOut.current.clear();
    const result = await catalogue.refetch();
    if (result.isSuccess) await queryClient.invalidateQueries({ queryKey: estimationCatalogueKeys.recommendations });
    if (result.isSuccess && [save.error, submit.error].some((error) =>
      error instanceof ApiError && error.code === "ESTIMATE_CATALOGUE_CHANGED"
    )) {
      save.reset();
      submit.reset();
    }
  };

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
  const updateConfiguredLine = (key: string, change: Partial<ConfiguredLineDraft>) => {
    const line = configuredLines.find((item) => item.key === key);
    if (change.included === true && line && !line.included && !line.sourceMissing && line.roomId === activeRoomId &&
      tab === "builder" && editable) {
      setNotice("");
      setPendingRecommendationSources((current) => current.some((event) => event.lineKey === line.key)
        ? current : [...current, {
          roomId: line.roomId, lineKey: line.key, sourceMainLineId: line.mainLineId,
          sourceIdentity: recommendationSourceIdentity(line), sequence: ++recommendationSequence.current
        }]);
    }
    if (change.included === false && line?.included) {
      setPendingRecommendationSources((current) => current.filter((event) => event.lineKey !== line.key));
      if (automaticRecommendationContext.current?.sources.some((event) => event.lineKey === line.key)) {
        automaticRecommendationContext.current = null;
        selectedDuringSlideOut.current.clear();
      }
    }
    setConfiguredLines((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  };
  const selectRecommendedLine = (target: RecommendedLineTarget) => {
    if (!editable || !catalogue.data || catalogue.isError || catalogue.isFetching ||
      recommendationState !== "ready" || !activeRoomId || !recommendationView) return false;
    const permitted = recommendationView.decisions.some((decision) => decision.available && (
      decision.kind === "main_line"
        ? decision.target?.mainLineId === target.mainLineId && decision.target.basketId === target.basketId && decision.target.subBasketId === target.subBasketId
        : decision.children.some((child) => child.target.mainLineId === target.mainLineId && child.target.basketId === target.basketId && child.target.subBasketId === target.subBasketId)
    ));
    if (!permitted) return false;
    const nextBasketIds = new Set(selectedMainBasketIds);
    nextBasketIds.add(target.basketId);
    setSelectedMainBasketIds(nextBasketIds);
    setConfiguredLines((previous) => buildConfiguredLines(catalogue.data, rooms, nextBasketIds, previous).map((line) =>
      line.roomId === activeRoomId && line.mainLineId === target.mainLineId && !line.sourceMissing &&
      line.mainBasketId === target.basketId && line.subBasketId === target.subBasketId
        ? { ...line, included: true } : line
    ));
    if (automaticRecommendationContext.current) {
      selectedDuringSlideOut.current.add(recommendedTargetIdentity(activeRoomId, target));
    }
    return true;
  };
  const roomTotalPaise = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    const legacy = lines.filter((line) => line.roomName === room?.label && line.included).reduce((sum, line) => sum + Math.round(line.quantity * line.rate) * 100, 0);
    const configured = configuredLines.filter((line) => line.roomId === roomId).reduce((sum, line) => sum + (configuredLineAmountPaise(line) ?? 0), 0);
    return legacy + configured;
  };
  const roomTotalLabel = (roomId: string) => configuredLines.some((line) => line.roomId === roomId && line.included && configuredLineAmountPaise(line) === null)
    ? "Incomplete" : moneyPaise(roomTotalPaise(roomId));
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
  const totalLabel = (value: number) => hasIncompleteConfiguredTotal ? "Incomplete" : money(value);
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
  const projectNavigation = leadItem.projectId && (!saved.data?.projectId || saved.data.projectId === leadItem.projectId)
    ? <ProjectChatNavigation projectId={leadItem.projectId} overviewTo={`/estimator-sales/leads/${leadId}/estimate`} overviewLabel="Estimate" />
    : null;

  return <section className={`estimate-workspace estimator-dashboard${tab === "configure" ? " estimate-workspace--configure-view" : " estimate-workspace--item-view"}`} aria-labelledby="estimate-title">
    {tab === "configure" ? <Link to={`/estimator-sales/leads/${leadId}`} className="estimate-workspace__back lead-detail__back-link"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>Back to {leadItem.clientName}</Link> : <button type="button" onClick={() => setTab("configure")} className="estimate-workspace__back lead-detail__back-link"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D89A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>Back to {leadItem.clientName}</button>}
    <header className="estimate-workspace__header"><div className="estimate-workspace__title"><p className="eyebrow">Estimate draft · {leadItem.clientName}</p><h1 id="estimate-title">{tab === "configure" ? "Configure estimate" : "Select estimate items"}</h1><p>{leadItem.projectName} · {leadItem.location}</p></div>{tab !== "configure" ? projectNavigation : null}<div className="estimate-workspace__summary"><strong>{totalLabel(totals.total)}</strong><span>Total including GST</span>{tab !== "configure" ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="1" /><path d="M8 6h8v3H8zM8 13h2m4 0h2m-8 4h2m4 0h2" /></svg> : null}</div></header>
    {tab === "configure" ? projectNavigation : null}
    {saved.data?.clientReview ? <EstimateDeliveryStatus review={saved.data.clientReview} retrying={retryEmail.isPending} onRetry={() => retryEmail.mutate()} /> : null}
    {saved.data?.clientFeedback ? <EstimateClientFeedback feedback={saved.data.clientFeedback} editable={editable} refreshing={saved.isFetching} refreshFailed={saved.isRefetchError} onRefresh={() => void saved.refetch()} /> : null}
    {saved.data?.status === "client_changes_requested" ? <EstimatePlanChangeRequests estimateId={saved.data.id} /> : null}
    {tab !== "configure" ? <nav aria-label="Estimate views" className="estimate-workspace__tabs">{(["builder", "summary", "proposal"] as const).map((value) => { const active = tab === value; return <button type="button" key={value} onClick={() => setTab(value)} aria-pressed={active}><TabIcon tab={value} /> {value === "builder" ? "Estimate Builder" : value === "summary" ? "Summary" : "Proposal"}</button>; })}</nav> : null}
    {tab === "configure" ? <>
      <section className="estimate-panel estimate-configure-details" aria-labelledby="estimate-project-details-title">
        <div className="estimate-configure-details__heading"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></svg><h2 id="estimate-project-details-title">Project details</h2></div>
        <div className="estimate-configure-details__fields">
          <div className="estimate-configure-details__field" role="group" aria-labelledby="estimate-property-type-label"><span id="estimate-property-type-label">Property type</span><PropertyTypeDropdown options={propertyTypes} value={propertyType || leadItem.propertyType} onChange={setPropertyType} /></div>
          <div className="estimate-configure-details__field" role="group" aria-labelledby="estimate-rooms-label"><span id="estimate-rooms-label">Rooms</span><RoomsMultiSelectDropdown options={roomSelectOptions} selected={selectedRoomTypeIds} onChange={handleRoomsChange} /></div>
        </div>
      </section>
      {rooms.length ? <section className="estimate-configure-dimensions" aria-label="Room dimensions"><RoomDimensionsAccordion rooms={rooms.map((room) => ({ id: room.id, label: room.label, icon: roomIcons[room.typeId] ?? Pencil, length: room.length, width: room.width }))} onDimensionChange={updateRoom} onRemove={removeRoom} /></section> : null}
      <section className="estimate-panel configured-estimate-chooser" aria-labelledby="estimate-main-baskets-title">
        <div className="configured-estimate-chooser__heading"><div><p className="eyebrow">Configuration</p><h2 id="estimate-main-baskets-title">Main Baskets</h2><p>Select the Main Baskets for this estimate. Available Main Lines and temporary items appear in the builder.</p></div>{configuredMode ? <button type="button" className="button button--secondary" disabled={catalogue.isFetching} onClick={() => void refreshAvailableItems()}>Refresh available items</button> : null}</div>
        {!configuredMode ? <div className="configured-estimate-chooser__state"><p>This estimate contains historical items. You can keep editing them, or add current configured items.</p><button type="button" className="button button--secondary" onClick={() => setCatalogueRequested(true)}>Load configured baskets</button></div> : null}
        {configuredMode && catalogue.isPending ? <p role="status">Loading configured baskets…</p> : null}
        {configuredMode && catalogue.isFetching && catalogue.data ? <p role="status">Refreshing available items…</p> : null}
        {configuredMode && catalogue.isError ? <div className="configured-estimate-chooser__state" role="alert"><p>{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? "You do not have permission to read the estimator catalogue." : catalogue.data ? "The catalogue refresh failed. The last loaded baskets are shown; retry before adding items." : "Configured baskets could not be loaded. Try again before selecting items."}</p>{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? null : <button type="button" className="button button--secondary" onClick={() => void catalogue.refetch()}>Retry catalogue</button>}</div> : null}
        {configuredMode && catalogue.data && !catalogue.isError && !catalogue.data.items.length ? <p className="configured-estimate-chooser__state">No active Main Baskets are available in the estimator catalogue.</p> : null}
        {configuredMode && catalogue.data?.readyNonActiveSupported === false ? <p className="configured-estimate-chooser__note" role="status">This catalogue currently shows Active items only. Draft and Inactive items will become available when the catalogue service is updated.</p> : null}
        {configuredMode && catalogue.data?.ineligibleLineCount ? <p className="configured-estimate-chooser__note">{catalogue.data.ineligibleLineCount} configured {catalogue.data.ineligibleLineCount === 1 ? "item is" : "items are"} unavailable in the estimator catalogue. Availability depends on item completeness and a valid UOM.</p> : null}
        {configuredMode && catalogue.data ? <div className="configured-estimate-chooser__list">{catalogue.data.items.map((basket) => <MainBasketSelectionRow key={basket.id} basket={basket} selected={selectedMainBasketIds.has(basket.id)} disabled={!editable || catalogue.isError} onToggle={() => toggleMainBasket(basket.id)} />)}</div> : null}
      </section>
      {!configuredMode && lines.length ? <button type="button" className="button button--secondary estimate-continue" onClick={() => setTab("builder")}>Return to saved items</button> : null}
      {configuredMode ? <button type="button" className="button button--primary estimate-continue" disabled={!rooms.length || !selectedMainBasketIds.size || !catalogue.data || catalogue.isError || !editable} onClick={buildLines}>Continue to item selection</button> : null}
    </> : null}
    {tab === "builder" && configuredMode && catalogue.isError ? <div className="configured-estimate-refresh">
      {catalogue.isError ? <p role="alert">{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? "You do not have permission to read the estimator catalogue." : catalogue.data ? "Available items could not be refreshed. The last loaded catalogue is shown. Try again." : "Available items could not be loaded. Try again."}</p> : null}
    </div> : null}
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
      onRefreshAvailableItems={() => void refreshAvailableItems()}
      refreshingAvailableItems={catalogue.isFetching}
      roomTotal={roomTotalPaise}
      roomIcons={roomIcons}
      moneyPaise={moneyPaise}
      editable={editable}
      recommendationSourceCount={recommendationSources.length + recommendationSourcePartition.historical.length + Number(recommendationSourcePartition.outdatedDraft)}
      recommendationState={recommendationState}
      recommendationView={recommendationView}
      recommendationDialogOpen={recommendationDialogOpen}
      automaticDismissal={Boolean(recommendationDialogOpen && automaticRecommendationContext.current?.roomId === activeRoomId)}
      onOpenRecommendations={() => {
        setPendingRecommendationSources([]);
        automaticRecommendationContext.current = null;
        selectedDuringSlideOut.current.clear();
        setRecommendationDialogOpen(true);
      }}
      onCloseRecommendations={() => {
        const context = automaticRecommendationContext.current;
        const successfulTargets = new Set(selectedDuringSlideOut.current);
        automaticRecommendationContext.current = null;
        selectedDuringSlideOut.current.clear();
        setRecommendationDialogOpen(false);
        setPendingRecommendationSources([]);
        if (!context || context.roomId !== activeRoomId || tab !== "builder" || !editable ||
          !catalogue.data || catalogue.isError || catalogue.isFetching ||
          catalogue.dataUpdatedAt !== context.catalogueUpdatedAt ||
          recommendationState === "stale" || recommendationState === "error" || recommendationState === "forbidden") return;

        const currentSources = partitionRoomRecommendationSources({
          catalogue: catalogue.data, lines: configuredLines, roomId: context.roomId
        }).current;
        const currentDecisions = recommendationState === "ready" && recommendationView
          ? recommendationView.decisions : context.decisions;
        const toUncheck = context.sources.filter((event) =>
          currentSources.some((line) => line.key === event.lineKey && line.mainLineId === event.sourceMainLineId &&
            recommendationSourceIdentity(line) === event.sourceIdentity) &&
          currentDecisions.some((decision) => decision.available && decision.reasons.some((reason) =>
            reason.sourceId === event.sourceMainLineId) &&
            (decision.kind === "main_line" ? Boolean(decision.target) : decision.children.length > 0)) &&
          !sourceHasSelectedRecommendation(event.sourceMainLineId, context.roomId, currentDecisions,
            currentSources, successfulTargets)
        );
        if (!toUncheck.length) return;
        const sourceKeys = new Set(toUncheck.map((event) => event.lineKey));
        setConfiguredLines((current) => current.map((line) =>
          sourceKeys.has(line.key) && line.roomId === context.roomId && line.included &&
          toUncheck.some((event) => event.lineKey === line.key &&
            event.sourceMainLineId === line.mainLineId && event.sourceIdentity === recommendationSourceIdentity(line))
            ? { ...line, included: false } : line
        ));
        const sourceName = currentSources.find((line) => line.key === toUncheck[0]?.lineKey)?.mainLineName;
        const roomName = rooms.find((room) => room.id === context.roomId)?.label ?? "this room";
        setNotice(toUncheck.length === 1
          ? `Removed ${sourceName ?? "the newly checked item"} from ${roomName} because no related item was selected.`
          : `Removed ${toUncheck.length} newly checked items from ${roomName} because no related item was selected for them.`);
      }}
      onRetryRecommendations={() => void recommendations.refetch()}
      onSelectRecommendedLine={selectRecommendedLine}
    /></> : null}
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
    {tab === "summary" ? <section className="estimate-panel estimate-summary"><h2>Estimate summary</h2>{rooms.map((room) => <div className="estimate-summary-row" key={room.id}><span><RoomIcon typeId={room.typeId} /> <strong>{room.label}</strong><small>{lines.filter((line) => line.roomName === room.label && line.included).length + configuredLines.filter((line) => line.roomId === room.id && line.included).length} selected items</small></span><strong>{roomTotalLabel(room.id)}</strong></div>)}{hasMissingRate ? <p role="status">Total incomplete: enter the selling rate for {incompleteConfiguredLines.length} selected items.</p> : null}{invalidSelectedAmountCount ? <p role="status">Total incomplete: correct the quantity or price for {invalidSelectedAmountCount} selected items.</p> : null}<div className="estimate-total-card"><span>Sub-total <strong>{totalLabel(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{totalLabel(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{totalLabel(totals.total)}</strong></span></div></section> : null}
    {tab === "proposal" ? <section className="estimate-panel estimate-proposal"><header><p className="eyebrow">Lisno interior proposal</p><h2>{leadItem.projectName}</h2><p>Prepared for {leadItem.clientName}</p></header>{rooms.map((room) => <article key={room.id}><h3><RoomIcon typeId={room.typeId} /> {room.label}</h3>{selectedLines.filter((line) => line.roomName === room.label).map((line) => <div key={line.id}><span>{catalogueRows.find((row) => row.id === line.catalogueId)?.description ?? line.catalogueId}<small>{line.specification} · {line.quantity} {line.unit}</small></span><strong>{money(Math.round(line.quantity * line.rate))}</strong></div>)}{selectedConfiguredLines.filter((line) => line.roomId === room.id).map((line) => <div key={line.key}><span>{line.mainLineName}<small>{line.mainBasketName}{line.subBasketName ? ` / ${line.subBasketName}` : ""} · {line.itemType === "temporary" ? "Temporary item" : "Main Line"} · {line.quantity} {line.uomName} · {parseSellingRate(line.rateInput).kind === "blank" ? "Rate required" : `₹${line.rateInput} per ${line.uomName}`}</small></span><strong>{configuredLineAmountPaise(line) === null ? "Incomplete" : moneyPaise(configuredLineAmountPaise(line) ?? 0)}</strong></div>)}</article>)}{hasMissingRate ? <p role="status">This proposal is incomplete until every selected item has a selling rate.</p> : null}{invalidSelectedAmountCount ? <p role="status">This proposal is incomplete until the highlighted quantities or prices are corrected.</p> : null}<div className="estimate-total-card"><span>Sub-total <strong>{totalLabel(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{totalLabel(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{totalLabel(totals.total)}</strong></span></div><p className="estimate-terms">Valid for 30 days. Rates subject to material market changes. Final scope on site measurement. GST as applicable.</p></section> : null}
    {tab !== "configure" ? <footer className="estimate-workspace__footer"><div><strong>{hasIncompleteConfiguredTotal ? "Total incomplete" : `${money(totals.total)} total`}</strong><span>{includedItemCount} selected line {includedItemCount === 1 ? "item" : "items"} across {rooms.length} {rooms.length === 1 ? "room" : "rooms"} · {saved.data?.status?.replaceAll("_", " ") ?? "draft"}</span></div><div className="estimate-actions">{editable ? <button type="button" className="button button--secondary" disabled={save.isPending || submit.isPending || hasInvalidInput || unavailableNewConfiguredLines.length > 0 || changedNewConfiguredLines.length > 0 || legacyIncompatibleConfiguredLines.length > 0 || estimateVersionConflict} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button> : null}{editable ? <button type="button" className="button button--primary estimate-continue" disabled={!includedItemCount || hasInvalidInput || hasMissingRate || unavailableNewConfiguredLines.length > 0 || changedNewConfiguredLines.length > 0 || legacyIncompatibleConfiguredLines.length > 0 || save.isPending || submit.isPending || estimateVersionConflict} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : "Submit estimate"}</button> : null}{saved.data?.status === "ready_for_client" ? <button type="button" className="button button--primary" disabled={sendToClient.isPending} onClick={() => sendToClient.mutate()}>{sendToClient.isPending ? "Sending…" : "Send to client"}</button> : null}</div></footer> : null}
    {hasInvalidInput ? <p className="estimate-notice estimate-notice--error" role="alert">Correct the highlighted rate or quantity before saving.</p> : null}
    {unavailableNewConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">A selected item is no longer available for a new estimate line. Refresh available items or uncheck it before saving.</p> : null}
    {changedNewConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">A selected item changed during refresh. Review its updated source, quantity, and rate in the builder before saving.</p> : null}
    {legacyIncompatibleConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">{catalogue.data?.readyNonActiveSupported === false ? "This catalogue service cannot save temporary items yet. Keep this estimate open and refresh after the service is updated." : "Refresh available items before saving temporary items in this estimate."}</p> : null}
    {estimateVersionConflict ? <div className="estimate-notice estimate-notice--error" role="alert"><p>This estimate changed elsewhere. Reload the latest saved estimate before editing it again.</p><button type="button" className="button button--secondary" onClick={() => void reloadSavedEstimate()}>Reload saved estimate (discard edits)</button></div> : [save.error, submit.error].some((error) => error instanceof ApiError && error.code === "ESTIMATE_CATALOGUE_CHANGED") ? <div className="estimate-notice estimate-notice--error" role="alert"><p>Configuration changed since you opened this estimate. Refresh available items and check the selected lines before saving.</p><button type="button" className="button button--secondary" onClick={() => void refreshAvailableItems()}>Refresh catalogue</button></div> : save.isError || submit.isError || sendToClient.isError ? <p className="estimate-notice estimate-notice--error" role="alert">The estimate action could not be completed. Check the current workflow state and try again.</p> : null}{retryError ? <p className="estimate-notice estimate-notice--error" role="alert">{retryError}</p> : null}{notice ? <p className="estimate-notice" role="status">{notice}</p> : null}
  </section>;
}
