import { ProjectId } from "../../components/projects/ProjectId";
import { invalidateProjectIdentityQueries } from "../../api/projectNameSync";
import { useEstimateInHousePricing } from "./useEstimateInHousePricing";
import { ESTIMATE_COMPONENT_PRICING_BASIS } from "../../../../shared/estimation/estimateComponentPricing";
import { canonicalEstimateDimensions, estimateDimensionRulesEqual } from "../../../../shared/estimation/estimateDimensions";
import { ProjectChatNavigation } from "../messages";
import { Dialog } from "../../components/ui/Dialog";
import { EstimateSubmissionChecklist } from "./EstimateSubmissionChecklist";
import { EstimateSetupFields } from "../estimates/EstimateSetupFields";
import { EstimateSetupBaskets, ConfigureSelectionFooter } from "../estimates/EstimateSetupBaskets";
import { EstimateBuilderArea } from "../estimates/EstimateBuilderArea";
import { EstimateNavigationGuard } from "../estimates/EstimateNavigationGuard";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Armchair, Hammer, Layers, PanelTop, Paintbrush, Sofa, Wrench, Zap } from "lucide-react";

import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { hasFrontendPermission } from "../../auth/authorization";
import type { EstimateClientReviewSummary, Lead } from "../../api/types";
import { AsyncState } from "../../components/ui/AsyncState";
import { adminProjectKeys } from "../admin/adminProjectsApi";
import { dashboardKeys } from "../admin/dashboard/superAdminDashboardApi";
import { clientKeys } from "../client/clientApi";
import { estimateRequirementsKeys, getEstimateRequirements } from "../client/estimateRequirementsApi";
import { estimateWorkflowKeys } from "../estimates/estimateWorkflowApi";
import { currentQuotationApprovalState } from "../estimates/quotationApproval";
import { projectWorkflowKeys } from "../workflow/projectWorkflowApi";
import { calculateEstimateTotals, resolveRate } from "./estimateEngine";
import { estimateBuilderSections } from "./estimateBuilderCatalogue";
import { EstimateBuilder, type BuilderLine, type BuilderRoom, type BuilderSection } from "./EstimateBuilder";
import { ConfiguredEstimateBuilder } from "./ConfiguredEstimateBuilder";
import { createConfiguredEstimateViewState } from "./useConfiguredEstimateViewState";
import { EstimateRevisionNavigation } from "./EstimateRevisionNavigation";
import { EstimateRevisionView } from "./EstimateRevisionView";
import { downloadEstimateRevisionPdf, estimateRevisionKeys, estimateRevisionLabel, getEstimateRevision, getEstimateRevisions } from "./estimateRevisionsApi";
import { configuredUsesComponentPricing, configuredComponentPricing, configuredDimensionsIssue, configuredInHouseSelectionIssue, buildConfiguredLines, createConfiguredLine, configuredLineAmountPaise, configuredLinePreviewAmountPaise, configuredQuantityUnits, deselectConfiguredRecommendationSources, parseSellingRate, restoreConfiguredLine, updateConfiguredLinePricing, type ConfiguredLineDraft } from "./configuredEstimate";
import { estimationCatalogueKeys, getEstimationCatalogue, getEstimationCatalogueRecommendations } from "./estimationCatalogueApi";
import { MainBasketSelectionCard } from "./MainBasketSelectionCard";
import { buildRoomRecommendations, partitionRoomRecommendationSources, recommendationSourceIdentity, type RecommendedLineTarget } from "./roomRecommendations";
import { EstimateDeliveryStatus } from "./EstimateDeliveryStatus";
import { EstimateClientFeedback } from "./EstimateClientFeedback";
import { EstimatePlanChangeRequests } from "./EstimatePlanChangeRequests";
import { getEstimateRoomDefinitions, getRoomIcon, mergeSelectedRoomDefinitions, parseBedroomCount, requiresBedroomCount } from "./estimateRoomOptions";
import { StaffEstimateCollaboration } from "./StaffEstimateCollaboration";
import { StaffEstimateRequirements } from "./StaffEstimateRequirements";
import { refreshEstimateCollaboration } from "./estimateCollaborationQueries";
import { configuredLineEditingFingerprint, estimateDraftFingerprint } from "./estimateDraftFingerprint";
import { useQuotationRevision } from "./useQuotationRevision";
import { getLead, getLeadEstimate, leadKeys, retryEstimateClientEmail, saveLeadEstimate, sendEstimateToClient, submitLeadEstimate, type ConfiguredEstimateLine, type EstimateClassification, type EstimateDraft, type EstimateDraftInput } from "./leadsApi";
import "../../styles/estimator-dashboard.css";

const scopeIcons: Record<string, typeof Sofa> = {
  FC: PanelTop, FL: Layers, CA: Hammer, PA: Paintbrush, EL: Zap, CV: Wrench, LF: Armchair
};
function RoomIcon({ typeId }: { typeId: string }) {
  const Icon = getRoomIcon(typeId);
  return <Icon size={16} aria-hidden="true" />;
}
function TabIcon({ tab }: { tab: EstimateTab }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab === "builder" ? <><rect x="5" y="5" width="14" height="16" rx="1" /><path d="M9 5V3h6v2M9 10h6M9 14h6M9 18h4" /></> : tab === "summary" ? <><path d="M4 20V11M9 20V5M14 20v-8M19 20V8M3 20h18" /></> : tab === "proposal" ? <><path d="M6 2h9l4 4v16H6zM15 2v5h4M9 11h7M9 15h7M9 19h5" /></> : <circle cx="12" cy="12" r="8" />}</svg>;
}
type EstimateTab = "configure" | "builder" | "summary" | "proposal";
type PublicationAction = "submit" | "send";
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

export function LeadEstimateWorkspace({ returnTo }: { returnTo?: string } = {}) {
  const { leadId = "" } = useParams();
  const auth = useAuth();
  const actorId = auth.user?.id ?? "";
  return <LeadEstimateWorkspaceForLead key={JSON.stringify([leadId, actorId, auth.reviewSession?.id, auth.user?.role])}
    actorId={actorId} leadId={leadId} returnTo={returnTo} />;
}

function retainProjectNumber<T extends { readonly projectNumber?: string | null }>(value: T, current: { readonly projectNumber?: string | null } | null | undefined): T {
  return value.projectNumber === undefined && current?.projectNumber
    ? { ...value, projectNumber: current.projectNumber }
    : value;
}

function LeadEstimateWorkspaceForLead({ leadId, returnTo, actorId }: { leadId: string; returnTo?: string; actorId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [pendingPublication, setPendingPublication] = useState<{ action: PublicationAction; context: string } | null>(null);
  const publicationInFlight = useRef(false);
  const publicationTriggerRef = useRef<HTMLElement | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [historicalRoomId, setHistoricalRoomId] = useState<string | null>(null);
  const [builderViewState, setBuilderViewState] = useState(createConfiguredEstimateViewState);
  const [revisionDownloadError, setRevisionDownloadError] = useState("");
  const [downloadingRevisionId, setDownloadingRevisionId] = useState<string | null>(null);
  const [deniedHistoryScope, setDeniedHistoryScope] = useState<string | null>(null);
  const revisionDownloadController = useRef<AbortController | null>(null);
  const revisionFocusPending = useRef(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const historical = selectedRevisionId !== null;
  const lead = useQuery({ queryKey: leadKeys.detail(leadId), queryFn: async () => retainProjectNumber(await getLead(leadId), queryClient.getQueryData<Lead>(leadKeys.detail(leadId))) });
  const saved = useQuery({ queryKey: leadKeys.estimate(leadId), queryFn: async () => {
    const estimate = await getLeadEstimate(leadId);
    return estimate ? retainProjectNumber(estimate, queryClient.getQueryData<EstimateDraft>(leadKeys.estimate(leadId))) : null;
  }, retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: false });
  const [catalogueRequested, setCatalogueRequested] = useState(false);
  const [submissionLocked, setSubmissionLocked] = useState(false);
  const [navigationSaving, setNavigationSaving] = useState(false);
  const navigationSaveInFlight = useRef(false);
  const [saveOutcomeUnknown, setSaveOutcomeUnknown] = useState(false);
  const unconfirmedSave = useRef<EstimateDraftInput | null>(null);
  const unconfirmedLines = useRef<readonly ConfiguredLineDraft[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<{
    kind: "sub" | "basket" | "all"; mainBasketId?: string; subBasketId?: string; roomId?: string; label: string;
  } | null>(null);
  const submissionInFlight = useRef(false);
  const hasConfiguredSaved = Boolean(saved.data?.lineItems.some((line) => line.source === "configuration") || saved.data?.selectedMainBasketIds?.length);
  const configuredMode = !saved.data || hasConfiguredSaved || catalogueRequested;
  const lifecycle = saved.data?.estimation;
  const quotationWorkflow = lifecycle?.workflowVersion === 3 || lead.data?.estimationWorkflowVersion === 3;
  const quotationApprovalState = quotationWorkflow
    ? currentQuotationApprovalState(saved.data)
    : undefined;
  const revisionReadyToPublish = quotationApprovalState === "revision_draft" ||
    quotationApprovalState === "revision_changes_requested";
  const canPublish = !quotationWorkflow || saved.data?.capabilities?.canPublishQuotation === true &&
    (lifecycle?.phase === "pre" || revisionReadyToPublish);
  const collaborative = quotationWorkflow || lifecycle?.workflowVersion === 2 || lead.data?.estimationWorkflowVersion === 2;
  const revision = useQuotationRevision(lead.data?.projectId, quotationWorkflow && Boolean(saved.data?.id), saved.data?.version);
  const requirements = useQuery({ queryKey: estimateRequirementsKeys.detail(lead.data?.projectId ?? ""),
    queryFn: () => getEstimateRequirements(lead.data!.projectId!), enabled: collaborative && Boolean(lead.data?.projectId) });
  const draftEditable = !lifecycle?.editClosedAt && (quotationWorkflow || !lifecycle?.finalApproval) && (!saved.data || ["draft", "designer_changes_requested", "client_changes_requested"].includes(lifecycle?.status ?? saved.data.status));
  const editable = draftEditable && !historical && !submissionLocked && !navigationSaving && !saveOutcomeUnknown && !saved.isError && !revision.isError;
  const workingVersion = useRef<number | undefined>(undefined);
  const catalogue = useQuery({
    queryKey: estimationCatalogueKeys.ready,
    queryFn: () => getEstimationCatalogue({ includeReadyNonActive: true }),
    enabled: !saved.isPending && !(saved.isError && saved.data === undefined) && configuredMode,
    staleTime: 60_000,
    refetchOnMount: "always", refetchOnWindowFocus: "always",
    retry: false
  });
  const [tab, setTab] = useState<EstimateTab>("configure");
  const estimateId = saved.data?.id ?? "";
  const historyAccessScope = JSON.stringify([actorId, estimateId]);
  const historyAccessDenied = deniedHistoryScope === historyAccessScope;
  const revisions = useInfiniteQuery({
    queryKey: estimateRevisionKeys.list(estimateId, actorId),
    queryFn: ({ pageParam, signal }) => getEstimateRevisions(estimateId, { cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.pagination.nextCursor,
    enabled: Boolean(estimateId && actorId) && tab !== "configure" && !saved.isError && !historyAccessDenied,
    retry: false, refetchOnMount: "always"
  });
  const denied = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
  const listDenied = denied(revisions.error) || denied(saved.error) || denied(lead.error) || historyAccessDenied;
  const historicalDetail = useQuery({
    queryKey: estimateRevisionKeys.detail(estimateId, selectedRevisionId ?? "", actorId),
    queryFn: ({ signal }) => getEstimateRevision(estimateId, selectedRevisionId!, signal),
    enabled: Boolean(estimateId && actorId && selectedRevisionId) && !listDenied && !saved.isError,
    retry: false, refetchOnMount: "always"
  });
  const historyDenied = listDenied || denied(historicalDetail.error);
  const selectedSnapshot = !historyDenied && !historicalDetail.isError && historicalDetail.data?.id === selectedRevisionId && historicalDetail.data.estimateId === estimateId
    ? historicalDetail.data : null;
  useEffect(() => () => revisionDownloadController.current?.abort(), []);
  useEffect(() => {
    if (!historyDenied) return;
    setDeniedHistoryScope(historyAccessScope);
    revisionDownloadController.current?.abort();
    void queryClient.cancelQueries({ queryKey: estimateRevisionKeys.estimate(estimateId, actorId) });
    queryClient.removeQueries({ queryKey: estimateRevisionKeys.estimate(estimateId, actorId) });
  }, [historyDenied, historyAccessScope, estimateId, actorId, queryClient]);
  useLayoutEffect(() => {
    if (!revisionFocusPending.current || !workspaceRef.current) return;
    const active = document.activeElement;
    if (active === document.body || !active?.isConnected) {
      const target = workspaceRef.current.querySelector<HTMLElement>('[aria-label="Estimate revisions"] summary') ??
        workspaceRef.current.querySelector<HTMLButtonElement>(".estimate-workspace__view-controls button");
      target?.focus();
    }
    if (!historical || selectedSnapshot || historicalDetail.isError || historyDenied) revisionFocusPending.current = false;
  }, [historical, selectedRevisionId, selectedSnapshot, historicalDetail.isError, historyDenied]);

  const [propertyType, setPropertyType] = useState("");
  const [bedroomCountInput, setBedroomCountInput] = useState("");
  const bedroomCountRef = useRef<HTMLInputElement>(null);
  const effectivePropertyType = propertyType || lead.data?.propertyType || "";
  const variableBedroomCount = requiresBedroomCount(effectivePropertyType);
  const bedroomCount = variableBedroomCount ? parseBedroomCount(bedroomCountInput) : null;
  const bedroomSetupRequired = draftEditable && variableBedroomCount && bedroomCount === null;
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [enabledSections, setEnabledSections] = useState<Set<string>>(() => new Set(["FC", "FL", "CA", "PA", "EL", "CV"]));
  const [selectedMainBasketIds, setSelectedMainBasketIds] = useState<Set<string>>(() => new Set());
  const [basketSearch, setBasketSearch] = useState("");
  const basketSearchRef = useRef<HTMLInputElement>(null);
  const [mainBasketClassifications, setMainBasketClassifications] = useState<Map<string, EstimateClassification>>(() => new Map());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [configuredDraftLines, setConfiguredLines] = useState<ConfiguredLineDraft[]>([]);
  const configuredLines = useEstimateInHousePricing(leadId, configuredDraftLines, draftEditable && !saved.isError);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [notice, setNotice] = useState("");
  const [retryError, setRetryError] = useState("");
  const skipSavedHydrationFor = useRef<EstimateDraft | null>(null);
  const hasHydratedSavedEstimate = useRef(false);
  const hydratedFingerprint = useRef<string | null>(null);
  const configuredEditBaselines = useRef(new Map<string, string>());
  const [hydrationRequest, setHydrationRequest] = useState(0);
  const hydrateEstimate = (draft: EstimateDraft | null, preserveView = false) => {
    workingVersion.current = draft?.version;
    hasHydratedSavedEstimate.current = true;
    hydratedFingerprint.current = draft ? estimateDraftFingerprint(draft) : null;
    configuredEditBaselines.current.clear();
    if (!draft) {
      setPropertyType("");
      setBedroomCountInput("");
      setRooms([]);
      setEnabledSections(new Set(["FC", "FL", "CA", "PA", "EL", "CV"]));
      setSelectedMainBasketIds(new Set());
      setMainBasketClassifications(new Map());
      setLines([]);
      setConfiguredLines([]);
      setActiveRoomId("");
      setTab("configure");
      return;
    }
    const restoredRooms = draft.rooms as RoomDraft[];
    setPropertyType(draft.propertyType);
    setBedroomCountInput(requiresBedroomCount(draft.propertyType) && draft.bedroomCount != null ? String(draft.bedroomCount) : "");
    setRooms(restoredRooms);
    setEnabledSections(new Set(draft.scopes));
    const selectedIds = draft.selectedMainBasketIds ?? draft.lineItems.filter((line) => line.source === "configuration").map((line) => line.mainBasketId);
    const savedClassifications = new Map(draft.selectedMainBasketClassifications?.map(({ mainBasketId, classification }) => [mainBasketId, classification]) ?? []);
    setSelectedMainBasketIds(new Set(selectedIds));
    setMainBasketClassifications(new Map(selectedIds.map((id) => [id, savedClassifications.get(id) ?? "standard"])));
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
    setActiveRoomId((current) => preserveView && restoredRooms.some((room) => room.id === current) ? current : restoredRooms[0]?.id ?? "");
    if (draft.lineItems.length && !preserveView) setTab("builder");
  };


  useEffect(() => {
    if (submissionInFlight.current || !catalogue.data || !configuredMode || !rooms.length || !selectedMainBasketIds.size) return;
    setConfiguredLines((previous) => buildConfiguredLines(catalogue.data, rooms, selectedMainBasketIds, previous, !draftEditable));
  }, [catalogue.data, configuredMode, draftEditable, submissionLocked, rooms, selectedMainBasketIds]);

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
    queryKey: [...estimationCatalogueKeys.recommendationSources(recommendationIdentity), leadId, actorId, activeRoomId, saved.data?.version ?? null],
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
  const invalidSelectedAmountCount = incompleteSelectedConfiguredLines.filter((line) => !configuredUsesComponentPricing(line) && parseSellingRate(line.rateInput).kind !== "blank").length;
  const invalidDimensionLines = configuredLines.filter(line => line.included && configuredDimensionsIssue(line));
  const invalidComponentLines = configuredLines.filter((line) => line.included && configuredInHouseSelectionIssue(line));
  const invalidConfiguredLines = configuredLines.filter((line) => line.included || line.persistedId).filter((line) => {
    const rate = parseSellingRate(line.rateInput);
    const quantityUnits = configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included);
    if (configuredUsesComponentPricing(line)) return quantityUnits === null;
    return rate.kind === "invalid" || quantityUnits === null ||
      (rate.kind === "value" && quantityUnits > 0 && configuredLinePreviewAmountPaise(line) === null);
  });
  const incompleteConfiguredLines = selectedConfiguredLines.filter((line) => !configuredUsesComponentPricing(line) && parseSellingRate(line.rateInput).kind === "blank");
  const unavailableConfiguredLines = configuredLines.filter((line) =>
    (line.included || line.persistedId) && selectedMainBasketIds.has(line.mainBasketId) && line.sourceMissing);
  const changedUomConfiguredLines = configuredLines.filter((line) => (line.included || line.persistedId) && line.uomNeedsQuantityReview);
  const supportsExpandedCatalogue = catalogue.data?.readyNonActiveSupported === true;
  const legacyIncompatibleConfiguredLines = !supportsExpandedCatalogue
    ? configuredLines.filter((line) => (line.included || line.persistedId) && (line.itemType === "temporary" || line.subBasketId === null))
    : [];
  const draftInput = (): EstimateDraftInput => ({
    propertyType: effectivePropertyType,
    bedroomCount,
    rooms, scopes: lines.length ? Array.from(enabledSections) : [],
    selectedMainBasketIds: Array.from(selectedMainBasketIds),
    selectedMainBasketClassifications: Array.from(selectedMainBasketIds, (mainBasketId) => ({
      mainBasketId, classification: mainBasketClassifications.get(mainBasketId) ?? "standard"
    })),
    ...(typeof workingVersion.current === "number" ? { expectedVersion: workingVersion.current } : {}),
    lineItems: [
      ...lines.map(({ catalogueId, roomName, specification, unit, rate, quantity, included }) => ({ source: "legacy" as const, catalogueId, roomName, specification, unit, rate, quantity, included })),
      ...configuredLines.filter((line) => line.included || line.persistedId).map((line) => ({
        source: "configuration" as const,
        ...(supportsExpandedCatalogue ? { itemType: line.itemType } : {}),
        classification: line.classification ?? "standard",
        modeTier: line.modeTier ?? "signature",
        ...(line.pricingMode !== undefined ? { pricingMode: line.pricingMode } : {}),
        ...(line.selectedInHouseComponentIds !== undefined ? { selectedInHouseComponentIds: line.selectedInHouseComponentIds } : {}),
        ...(line.rateSource !== undefined ? { rateSource: line.rateSource } : {}),
        id: line.persistedId, catalogueId: line.mainLineId,
        roomId: line.roomId, roomName: line.roomName, mainBasketId: line.mainBasketId,
        subBasketId: line.subBasketId, mainLineId: line.mainLineId, revisionId: line.revisionId,
        ...(line.recommendationSourceMainLineIds !== undefined
          ? { recommendationSourceMainLineIds: line.recommendationSourceMainLineIds } : {}),
        ...(supportsExpandedCatalogue && (!line.persistedId || line.rateSource === "configuration" || line.dimensionsMandatory) && line.itemVersion !== undefined ? { itemVersion: line.itemVersion } : {}),
        ...(supportsExpandedCatalogue && (!line.persistedId || line.rateSource === "configuration" || line.dimensionsMandatory) && line.revisionVersion !== undefined ? { revisionVersion: line.revisionVersion } : {}),
        ...(line.dimensions && (line.included || canonicalEstimateDimensions(line.dimensions)) ? { dimensions: canonicalEstimateDimensions(line.dimensions) ?? line.dimensions,
          ...(line.dimensionsMandatory && line.dimensionRule ? { expectedDimensionRule: line.dimensionRule } : {}) } : {}),
        uomId: line.uomId, quantity: line.quantity, included: line.included,
        ...(line.included && configuredComponentPricing(line) ? { pricingBasis: ESTIMATE_COMPONENT_PRICING_BASIS, componentPricingFingerprint: configuredComponentPricing(line)!.inputFingerprint } : {}),
        ratePaise: configuredUsesComponentPricing(line) ? null : parseSellingRate(line.rateInput).paise
      }))
    ]
  });
  const localFingerprint = estimateDraftFingerprint(draftInput());
  const hasRawConfiguredEdits = configuredLines.some(line => {
    const baseline = configuredEditBaselines.current.get(line.key);
    return baseline !== undefined && baseline !== configuredLineEditingFingerprint(line);
  });
  const hasUnsavedChanges = hasHydratedSavedEstimate.current && (hasRawConfiguredEdits ||
    (hydratedFingerprint.current !== null ? hydratedFingerprint.current !== localFingerprint :
      rooms.length > 0 || selectedMainBasketIds.size > 0 || configuredLines.some(line => line.included) || lines.length > 0));
  useEffect(() => {
    const draft = saved.data;
    if (draft && draft === skipSavedHydrationFor.current) {
      skipSavedHydrationFor.current = null;
      hasHydratedSavedEstimate.current = true;
      return;
    }
    if (!saved.isSuccess || submissionInFlight.current) return;
    const firstLoad = !hasHydratedSavedEstimate.current;
    const newerRevision = draft?.version !== workingVersion.current;
    const untouched = hydratedFingerprint.current === localFingerprint && !hasRawConfiguredEdits;
    if (!firstLoad && (!newerRevision || !untouched)) return;
    hydrateEstimate(draft ?? null, !firstLoad);
  }, [saved.data, saved.isSuccess, hydrationRequest, localFingerprint, hasRawConfiguredEdits]);

  const refreshSubmittedEstimate = (estimate: EstimateDraft, submittedLeadId: string) => {
    void queryClient.invalidateQueries({ queryKey: estimateRevisionKeys.estimate(estimate.id, actorId) });
    if (estimate.estimation) void refreshEstimateCollaboration(queryClient);
    if (submittedLeadId === leadId) {
        skipSavedHydrationFor.current = null;
      hydrateEstimate(estimate, true);
    }
    queryClient.setQueryData<EstimateDraft>(leadKeys.estimate(submittedLeadId), (current) => ({
      ...retainProjectNumber(estimate, current),
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
  const rememberDraftSave = (estimate: EstimateDraft, submittedLeadId: string, submittedInput: EstimateDraftInput, submittedLineState: readonly ConfiguredLineDraft[]) => {
    const previousNumber = queryClient.getQueryData<EstimateDraft>(leadKeys.estimate(submittedLeadId))?.projectNumber;
    const cached = queryClient.setQueryData<EstimateDraft>(leadKeys.estimate(submittedLeadId), (current) => ({
      ...retainProjectNumber(estimate, current), clientFeedback: estimate.clientFeedback === undefined ? current?.clientFeedback : estimate.clientFeedback
    }));
    if (cached?.projectNumber) {
      queryClient.setQueryData<Lead>(leadKeys.detail(submittedLeadId), (current) => current
        ? { ...current, projectNumber: cached.projectNumber }
        : undefined);
      const savedProjectId = cached.projectId ?? queryClient.getQueryData<Lead>(leadKeys.detail(submittedLeadId))?.projectId;
      if (savedProjectId && previousNumber !== cached.projectNumber) {
        void invalidateProjectIdentityQueries(queryClient, savedProjectId);
      }
    }
    // The draft is committed even if the following submission fails.
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: leadKeys.all, predicate: query => !(query.queryKey.length === 3 && query.queryKey[2] === "estimate") }),
      queryClient.invalidateQueries({ queryKey: adminProjectKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["assigned-projects"] }),
      queryClient.invalidateQueries({ queryKey: projectWorkflowKeys.all })
    ]);
    if (submittedLeadId !== leadId) return;
    workingVersion.current = estimate.version;
    hydratedFingerprint.current = estimateDraftFingerprint(submittedInput);
    skipSavedHydrationFor.current = cached ?? null;
    const savedLines = new Map(estimate.lineItems
      .filter((line): line is ConfiguredEstimateLine => line.source === "configuration")
      .map((line) => [`${line.roomId}\u0000${line.mainLineId}`, line]));
    const submittedLines = new Map(submittedInput.lineItems
      .filter((line) => line.source === "configuration")
      .map((line) => [`${line.roomId}\u0000${line.mainLineId}`, line]));
    const submittedState = new Map(submittedLineState.map((line) => [line.key, line]));
    for (const line of submittedLineState) {
      if (configuredEditBaselines.current.has(line.key) && submittedLines.has(`${line.roomId}\u0000${line.mainLineId}`)) {
        configuredEditBaselines.current.set(line.key, configuredLineEditingFingerprint(line));
      }
    }
    setConfiguredLines((current) => current.map((line) => {
      const stored = savedLines.get(`${line.roomId}\u0000${line.mainLineId}`);
      const submitted = submittedLines.get(`${line.roomId}\u0000${line.mainLineId}`);
      const selectionUnchanged = submitted && submitted.included === line.included &&
        JSON.stringify(submitted.recommendationSourceMainLineIds) ===
          JSON.stringify(line.recommendationSourceMainLineIds);
      const snapshot = submittedState.get(line.key);
      const sourceUnchanged = snapshot && (snapshot.modeTier ?? "signature") === (line.modeTier ?? "signature") && snapshot.revisionId === line.revisionId &&
        snapshot.mainBasketId === line.mainBasketId && snapshot.subBasketId === line.subBasketId &&
        snapshot.mainBasketName === line.mainBasketName && snapshot.subBasketName === line.subBasketName &&
        snapshot.mainLineName === line.mainLineName && snapshot.uomId === line.uomId &&
        snapshot.uomName === line.uomName && snapshot.uomDecimalScale === line.uomDecimalScale &&
        snapshot.itemVersion === line.itemVersion && snapshot.revisionVersion === line.revisionVersion;
      const dimensionsUnchanged = snapshot && Boolean(snapshot.dimensionsMandatory) === Boolean(line.dimensionsMandatory) &&
        estimateDimensionRulesEqual(snapshot.dimensionRule, line.dimensionRule) && JSON.stringify(snapshot.dimensions) === JSON.stringify(line.dimensions) &&
        snapshot.quantity === line.quantity && snapshot.dimensionsNeedReview === line.dimensionsNeedReview;
      const pricingUnchanged = submitted && submitted.classification === (line.classification ?? "standard") &&
        submitted.pricingMode === line.pricingMode && (submitted.modeTier ?? "signature") === (line.modeTier ?? "signature") && submitted.rateSource === line.rateSource &&
        JSON.stringify(submitted.selectedInHouseComponentIds) === JSON.stringify(line.selectedInHouseComponentIds) &&
        submitted.ratePaise === (configuredUsesComponentPricing(line) ? null : parseSellingRate(line.rateInput).paise);
      return stored ? {
        ...line,
        persistedId: stored.id,
        ...(sourceUnchanged ? {
          mainBasketId: stored.mainBasketId,
          mainBasketName: stored.mainBasketName,
          subBasketId: stored.subBasketId,
          subBasketName: stored.subBasketName,
          mainLineName: stored.mainLineName,
          revisionId: stored.revisionId,
          uomId: stored.uomId,
          uomName: stored.uomName,
          uomDecimalScale: stored.uomDecimalScale,
          sourceItemStatus: stored.sourceItemStatus ?? line.sourceItemStatus,
          sourceRevisionStatus: stored.sourceRevisionStatus ?? line.sourceRevisionStatus,
          sourceItemVersion: stored.sourceItemVersion ?? line.sourceItemVersion,
          sourceRevisionVersion: stored.sourceRevisionVersion ?? line.sourceRevisionVersion
        } : {}),
        ...(sourceUnchanged && dimensionsUnchanged && stored.dimensionsMandatory ? {
          dimensions: stored.dimensions, quantity: stored.quantity,
          dimensionsMandatory: stored.dimensionsMandatory, dimensionRule: stored.dimensionRule,
          dimensionsNeedReview: stored.dimensionsNeedReview
        } : {}),
        ...(selectionUnchanged ? {
          included: stored.included,
          recommendationSourceMainLineIds: stored.recommendationSourceMainLineIds
        } : {}),
        ...(sourceUnchanged && dimensionsUnchanged && pricingUnchanged && selectionUnchanged ? { pricingBasis: stored.pricingBasis, componentPricing: stored.componentPricing } : {}),
        ...(pricingUnchanged ? {
          classification: stored.classification ?? line.classification,
          pricingMode: stored.pricingMode ?? line.pricingMode,
          modeTier: stored.modeTier ?? "signature",
          selectedInHouseComponentIds: stored.selectedInHouseComponentIds ?? line.selectedInHouseComponentIds,
          rateSource: stored.rateSource ?? line.rateSource
        } : {})
      } : line;
    }));
  };
  const save = useMutation({
    mutationFn: async () => {
      const submittedLeadId = leadId;
      if (bedroomSetupRequired) throw new Error("Configure the number of bedrooms before saving.");
      if (configuredLines.some(line => line.included && configuredUsesComponentPricing(line) && !configuredComponentPricing(line))) throw new Error("Complete the In-house component calculation before saving.");
      const input = draftInput();
      const lineState = configuredLines;
      unconfirmedSave.current = input;
      unconfirmedLines.current = lineState;
      return { estimate: await saveLeadEstimate(submittedLeadId, input), submittedLeadId, input, lineState };
    },
    onMutate: () => {
        setNotice("");
    },
    onSuccess: ({ estimate, submittedLeadId, input, lineState }) => {
      unconfirmedSave.current = null;
      setSaveOutcomeUnknown(false);
      rememberDraftSave(estimate, submittedLeadId, input, lineState);
      submit.reset();
      setNotice("Estimate draft saved.");
      if (estimate.estimation) void refreshEstimateCollaboration(queryClient);
    },
    onError: error => {
      if (unconfirmedSave.current && (!(error instanceof ApiError) || error.status >= 500 || error.status === 408)) {
        setSaveOutcomeUnknown(true);
      } else unconfirmedSave.current = null;
    }
  });
  const submit = useMutation({
    mutationFn: async () => {
      const submittedLeadId = leadId;
      if (!canPublish) throw new Error("Publication is unavailable for your current assignment and quotation phase.");
      if (bedroomSetupRequired) throw new Error("Configure the number of bedrooms before saving.");
      if (configuredLines.some(line => line.included && configuredUsesComponentPricing(line) && !configuredComponentPricing(line))) throw new Error("Complete the In-house component calculation before saving.");
      const input = draftInput();
      const lineState = configuredLines;
      const draft = await saveLeadEstimate(submittedLeadId, input);
      rememberDraftSave(draft, submittedLeadId, input, lineState);
      save.reset();
      return { estimate: await submitLeadEstimate(submittedLeadId, draft.estimation ? draft.version : undefined, draft.estimation?.workflowVersion === 3 && draft.estimation.phase === "pre"), submittedLeadId };
    },
    onMutate: () => {
      submissionInFlight.current = true;
      setSubmissionLocked(true);
        setNotice("");
    },
    onSuccess: ({ estimate, submittedLeadId }) => {
      if (leadId === submittedLeadId) setNotice(estimate.approvalRequired
        ? "Submitted. A design manager must now assign a designer for approval."
        : publicationNotice("Submitted to the client portal for approval.", estimate.clientReview));
      refreshSubmittedEstimate(estimate, submittedLeadId);
    },
    onSettled: () => {
      submissionInFlight.current = false;
      setSubmissionLocked(false);
    }
  });
  const sendToClient = useMutation({
    mutationFn: async () => {
      const submittedLeadId = leadId;
      if (!canPublish) throw new Error("Publication is unavailable for your current assignment and quotation phase.");
      return { estimate: await sendEstimateToClient(saved.data!.id, saved.data!.estimation ? saved.data!.version : undefined, lifecycle?.workflowVersion === 3 && lifecycle.phase === "pre"), submittedLeadId };
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
      await Promise.all([saved.refetch(), queryClient.invalidateQueries({ queryKey: estimateRevisionKeys.estimate(estimateId, actorId) })]);
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
    void queryClient.invalidateQueries({ queryKey: ["estimate-in-house-pricing", leadId] });
    const result = await catalogue.refetch();
    if (result.isSuccess) await queryClient.invalidateQueries({ queryKey: estimationCatalogueKeys.recommendations });
    if (result.isSuccess && [save.error, submit.error].some((error) =>
      error instanceof ApiError && error.code === "ESTIMATE_CATALOGUE_CHANGED"
    )) {
      save.reset();
      submit.reset();
    }
  };

  const includedItemCount = selectedLines.length + selectedConfiguredLines.length;
  const componentPricingPending = selectedConfiguredLines.some(line => configuredUsesComponentPricing(line) && configuredComponentPricing(line) === null);
  const hasInvalidInput = invalidDimensionLines.length > 0 || invalidComponentLines.length > 0 || invalidConfiguredLines.length > 0 || changedUomConfiguredLines.length > 0;
  const hasMissingRate = incompleteConfiguredLines.length > 0;
  const totalLabel = (value: number) => hasIncompleteConfiguredTotal ? "Incomplete" : money(value);
  const estimateVersionConflict = (workingVersion.current !== undefined && saved.data?.version !== undefined && workingVersion.current !== saved.data.version) || [save.error, submit.error].some((error) =>
    error instanceof ApiError && ["ESTIMATE_VERSION_CONFLICT", "ESTIMATE_SOURCE_CONFLICT"].includes(error.code)
  );
  const saveDisabled = !editable || bedroomSetupRequired || save.isPending || submit.isPending || hasInvalidInput ||
    componentPricingPending || unavailableConfiguredLines.length > 0 || legacyIncompatibleConfiguredLines.length > 0 || estimateVersionConflict;
  const publicationBlocked = collaborative && (requirements.isPending || requirements.isError || requirements.isFetching || !requirements.data || requirements.data.requirements.some((request) => request.status === "open") ||
    (lifecycle?.workflowVersion === 2 && lifecycle.phase === "post" && (saved.data?.designPlanStatus !== "approved" || lifecycle.approvedDesignScopeRevision !== lifecycle.designScopeRevision)));

  const checklistRequired = auth.user?.role === "estimator_sales";
  const revisionMismatch = quotationWorkflow && revision.data && saved.data &&
    (revision.data.estimateId !== saved.data.id || revision.data.estimateVersion !== saved.data.version);
  const checklistContextReady = auth.status === "authenticated" && lead.isSuccess && !lead.isFetching &&
    saved.isSuccess && !saved.isFetching && !revision.isError && !revisionMismatch &&
    !saveOutcomeUnknown && !estimateVersionConflict && !navigationSaving &&
    !save.isPending && !submit.isPending && !sendToClient.isPending &&
    (!configuredMode || catalogue.isSuccess && !catalogue.isFetching);
  const submitAllowed = !historical && tab !== "configure" && draftEditable && canPublish && editable &&
    !publicationBlocked && !bedroomSetupRequired && includedItemCount > 0 && !hasInvalidInput &&
    !componentPricingPending && !hasMissingRate && unavailableConfiguredLines.length === 0 &&
    legacyIncompatibleConfiguredLines.length === 0 && !save.isPending && !submit.isPending && !estimateVersionConflict &&
    (!checklistRequired || checklistContextReady &&
      hasFrontendPermission(auth.authorization ?? null, "estimation.estimate.save") &&
      hasFrontendPermission(auth.authorization ?? null, "estimation.estimate.submit"));
  const sendAllowed = !historical && tab !== "configure" && saved.data?.status === "ready_for_client" &&
    canPublish && !sendToClient.isPending && !publicationBlocked && !saved.isError &&
    (!checklistRequired || checklistContextReady &&
      hasFrontendPermission(auth.authorization ?? null, "estimation.estimate.send_client"));
  const publicationContext = JSON.stringify([
    actorId, auth.reviewSession?.id, auth.user?.role, leadId, lead.data?.projectId, estimateId,
    saved.data?.version, workingVersion.current, saved.data?.status, lifecycle?.phase, canPublish,
    quotationWorkflow ? revision.data : null, localFingerprint,
    configuredLines.map(line => [line.key, configuredLineEditingFingerprint(line), line.itemVersion, line.revisionVersion]).sort()
  ]);
  useEffect(() => {
    if (pendingPublication && !publicationInFlight.current &&
      (pendingPublication.context !== publicationContext ||
        !(pendingPublication.action === "submit" ? submitAllowed : sendAllowed))) {
      setPendingPublication(null);
    }
  }, [pendingPublication, publicationContext, submitAllowed, sendAllowed]);
  const executePublication = (action: PublicationAction) => {
    if (publicationInFlight.current || !(action === "submit" ? submitAllowed : sendAllowed)) return;
    publicationInFlight.current = true;
    const onSettled = () => {
      publicationInFlight.current = false;
      setPendingPublication(null);
    };
    if (action === "submit") submit.mutate(undefined, { onSettled });
    else sendToClient.mutate(undefined, { onSettled });
  };
  const requestPublication = (action: PublicationAction, trigger: HTMLElement) => {
    if (publicationInFlight.current || !(action === "submit" ? submitAllowed : sendAllowed)) return;
    if (!checklistRequired) { executePublication(action); return; }
    publicationTriggerRef.current = trigger;
    setPendingPublication({ action, context: publicationContext });
  };
  const confirmPublication = () => {
    if (!pendingPublication || publicationInFlight.current) return;
    if (pendingPublication.context !== publicationContext ||
      !(pendingPublication.action === "submit" ? submitAllowed : sendAllowed)) {
      setPendingPublication(null);
      return;
    }
    executePublication(pendingPublication.action);
  };

  if (lead.isPending || saved.isPending) return <AsyncState state="loading" message="Loading estimate…" />;
  if (lead.isError) return <>
    <EstimateNavigationGuard dirty={hasUnsavedChanges || saveOutcomeUnknown} busy={save.isPending || submit.isPending || navigationSaving} saveDisabled onSave={async () => false} />
    <AsyncState state="error" message="We couldn't load this lead. Any unsaved estimate changes are preserved until you leave." actionLabel="Try again" onAction={() => void lead.refetch()} />
  </>;
  if (saved.isError && saved.data === undefined) return <>
    <EstimateNavigationGuard dirty={hasUnsavedChanges || saveOutcomeUnknown} busy={save.isPending || submit.isPending || navigationSaving} saveDisabled onSave={async () => false} />
    <AsyncState state="error" message="We couldn't load the saved estimate. Retry before making changes." actionLabel="Retry estimate" onAction={() => void saved.refetch()} />
  </>;
  const leadItem = lead.data;
  const basketSearchTerm = basketSearch.trim().toLowerCase();
  const visibleBaskets = catalogue.data?.items.filter((basket) => basket.name.toLowerCase().includes(basketSearchTerm)) ?? [];
  const roomControlsDisabled = !editable || save.isPending || submit.isPending;
  const basketSelectionDisabled = roomControlsDisabled || catalogue.isError || !catalogue.data;
  const roomDefinitions = getEstimateRoomDefinitions(effectivePropertyType, bedroomCount);
  const displayedRoomDefinitions = mergeSelectedRoomDefinitions(roomDefinitions, rooms);
  const roomSelectOptions = displayedRoomDefinitions.map((definition) => ({ id: definition.typeId, label: definition.label, group: definition.group, icon: getRoomIcon(definition.typeId) }));
  const hasRetainedRooms = displayedRoomDefinitions.some((definition) => definition.group === "Previously selected");
  const roomIcons = Object.fromEntries(rooms.map((room) => [room.typeId, getRoomIcon(room.typeId)]));
  const changePropertyType = (nextType: string) => {
    if (roomControlsDisabled || submissionInFlight.current) return;
    if (!requiresBedroomCount(nextType)) setBedroomCountInput("");
    setPropertyType(nextType);
  };
  const clearBasketSearch = () => {
    setBasketSearch("");
    basketSearchRef.current?.focus();
  };

  const selectedRoomTypeIds = Array.from(new Set(rooms.map((room) => room.typeId)));
  const handleRoomsChange = (nextTypeIds: string[]) => {
    if (roomControlsDisabled || submissionInFlight.current) return;
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
      const additions = roomDefinitions.filter((definition) => added.includes(definition.typeId)).map((definition) => ({
        id: `${definition.typeId}-${crypto.randomUUID()}`, typeId: definition.typeId, label: definition.label,
        icon: "", sqft: definition.sqft, length: null, width: null
      }));
      return [...remaining, ...additions];
    });
  };
  const removeRoom = (id: string) => {
    if (roomControlsDisabled || submissionInFlight.current) return;
    const roomName = rooms.find((room) => room.id === id)?.label;
    setRooms((current) => current.filter((room) => room.id !== id));
    setConfiguredLines((current) => current.filter((line) => line.roomId !== id));
    if (roomName) setLines((current) => current.filter((line) => line.roomName !== roomName));
    if (activeRoomId === id) setActiveRoomId(rooms.find((room) => room.id !== id)?.id ?? "");
  };
  const updateRoom = (id: string, change: Partial<RoomDraft>) => {
    if (roomControlsDisabled || submissionInFlight.current) return;
    setRooms((current) => current.map((room) => {
      if (room.id !== id) return room;
      const next = { ...room, ...change };
      if (next.length && next.width) next.sqft = Math.round(next.length * next.width);
      return next;
    }));
  };
  const toggleMainBasket = (id: string, confirmed = false) => {
    if (basketSelectionDisabled || submissionInFlight.current) return;
    if (!confirmed && selectedMainBasketIds.has(id) && configuredLines.some(line => line.mainBasketId === id && line.included)) {
      setPendingRemoval({ kind: "basket", mainBasketId: id, label: catalogue.data?.items.find(basket => basket.id === id)?.name ?? "Main Basket" });
      return;
    }
    if (selectedMainBasketIds.has(id)) {
      setConfiguredLines((prior) => deselectConfiguredRecommendationSources(prior,
        new Set(prior.filter((line) => line.mainBasketId === id && line.included).map((line) => line.key))));
    }
    setSelectedMainBasketIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setMainBasketClassifications((current) => {
      if (current.has(id)) return current;
      const next = new Map(current);
      next.set(id, "standard");
      return next;
    });
  };
  const clearMainBaskets = (confirmed = false) => {
    if (basketSelectionDisabled || submissionInFlight.current || !selectedMainBasketIds.size) return;
    if (!confirmed && configuredLines.some(line => selectedMainBasketIds.has(line.mainBasketId) && line.included)) {
      setPendingRemoval({ kind: "all", label: "all selected Main Baskets" });
      return;
    }
    setConfiguredLines((prior) => deselectConfiguredRecommendationSources(prior,
      new Set(prior.filter((line) => selectedMainBasketIds.has(line.mainBasketId) && line.included).map((line) => line.key))));
    setSelectedMainBasketIds(new Set());
  };
  const buildLines = () => {
    if (!catalogue.data || catalogue.isError || roomControlsDisabled || bedroomSetupRequired || submissionInFlight.current || !rooms.length || !selectedMainBasketIds.size) return;
    setCatalogueRequested(true);
    setConfiguredLines((previous) => buildConfiguredLines(catalogue.data, rooms, selectedMainBasketIds, previous));
    setActiveRoomId(current => rooms.some(room => room.id === current) ? current : rooms[0]?.id ?? "");
    setTab("builder");
  };
  const updateLine = (id: string, change: Partial<LineDraft>) => {
    if (!editable || submissionInFlight.current) return;
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...change } : line));
  };
  const updateConfiguredLine = (key: string, change: Partial<ConfiguredLineDraft>) => {
    if (!editable || submissionInFlight.current) return;
    const line = configuredLines.find((item) => item.key === key);
    if (line && !configuredEditBaselines.current.has(key)) {
      configuredEditBaselines.current.set(key, configuredLineEditingFingerprint(line));
    }
    setConfiguredLines((current) => {
      const updated = current.map((item) => item.key === key ? {
        ...updateConfiguredLinePricing(item, change, mainBasketClassifications.get(item.mainBasketId) ?? "standard"),
        ...(change.included !== undefined && change.included !== item.included
          ? { recommendationSourceMainLineIds: [] } : {}),
        ...((change.quantity !== undefined && !item.dimensionsMandatory || change.dimensionsNeedReview === false) ? { uomNeedsQuantityReview: false, previousUomName: undefined } : {}),
        ...(change.included === true && !item.included && item.classification === undefined
          ? { classification: mainBasketClassifications.get(item.mainBasketId) ?? "standard" } : {})
      } : item);
      return change.included === false ? deselectConfiguredRecommendationSources(updated, new Set([key])) : updated;
    });
  };
  const addConfiguredLine = (target: RecommendedLineTarget) => {
    if (!editable || submissionInFlight.current || !catalogue.data || catalogue.isError || catalogue.isFetching ||
      !selectedMainBasketIds.has(target.basketId)) return false;
    const room = rooms.find(room => room.id === activeRoomId);
    if (!room) return false;
    const fresh = createConfiguredLine(catalogue.data, room, target);
    if (!fresh) return false;
    const savedTarget = configuredLines.find(line => line.key === fresh.key);
    if (savedTarget && (savedTarget.mainBasketId !== target.basketId || savedTarget.subBasketId !== target.subBasketId || savedTarget.itemType !== fresh.itemType)) {
      setNotice("This saved item's Configuration grouping changed. Review its saved scope before adding it again.");
      return false;
    }
    setNotice("");
    setConfiguredLines(previous => {
      const existing = previous.find(line => line.key === fresh.key);
      return buildConfiguredLines(catalogue.data!, rooms, selectedMainBasketIds, existing ? previous : [...previous, fresh]).map(line =>
        line.key === fresh.key && !line.sourceMissing
          ? { ...line, included: true, recommendationSourceMainLineIds: [],
            classification: line.classification ?? mainBasketClassifications.get(target.basketId) ?? "standard" }
          : line);
    });
    return true;
  };
  const removeRecommendedLine = (target: RecommendedLineTarget) => {
    if (!editable || submissionInFlight.current) return false;
    const line = configuredLines.find(line => line.roomId === activeRoomId && line.mainLineId === target.mainLineId &&
      line.mainBasketId === target.basketId && line.subBasketId === target.subBasketId && line.included);
    if (!line) return false;
    updateConfiguredLine(line.key, { included: false });
    return true;
  };
  const selectRecommendedLine = (target: RecommendedLineTarget) => {
    if (!editable || submissionInFlight.current || !catalogue.data || catalogue.isError || catalogue.isFetching ||
      recommendationState !== "ready" || !activeRoomId || !recommendationView) return false;
    const matchingDecisions = recommendationView.decisions.filter((decision) => decision.requirement === "must" && decision.available && (
      decision.kind === "main_line"
        ? decision.target?.mainLineId === target.mainLineId && decision.target.basketId === target.basketId && decision.target.subBasketId === target.subBasketId
        : decision.children.some((child) => child.target.mainLineId === target.mainLineId && child.target.basketId === target.basketId && child.target.subBasketId === target.subBasketId)
    ));
    const sourceIds = [...new Set(matchingDecisions.flatMap((decision) => decision.reasons.map((reason) => reason.sourceId)))].filter((sourceId) =>
      sourceId !== target.mainLineId && configuredLines.some((line) =>
        line.roomId === activeRoomId && line.mainLineId === sourceId && line.included));
    if (!sourceIds.length) return false;
    const room = rooms.find(room => room.id === activeRoomId);
    if (!room) return false;
    const fresh = createConfiguredLine(catalogue.data, room, target);
    if (!fresh) return false;
    const savedTarget = configuredLines.find(line => line.key === fresh.key);
    if (savedTarget && (savedTarget.mainBasketId !== target.basketId || savedTarget.subBasketId !== target.subBasketId || savedTarget.itemType !== fresh.itemType)) {
      setNotice("This saved item's Configuration grouping changed. Review its saved scope before adding it again.");
      return false;
    }
    const nextBasketIds = new Set(selectedMainBasketIds);
    nextBasketIds.add(target.basketId);
    setSelectedMainBasketIds(nextBasketIds);
    setMainBasketClassifications((current) => current.has(target.basketId)
      ? current : new Map(current).set(target.basketId, "standard"));
    setConfiguredLines(previous => {
      const existing = previous.find(line => line.key === fresh.key);
      return buildConfiguredLines(catalogue.data!, rooms, nextBasketIds, existing ? previous : [...previous, fresh]).map(line =>
        line.key === fresh.key && !line.sourceMissing
          ? line.included ? line : { ...line, included: true, recommendationSourceMainLineIds: sourceIds,
            classification: line.classification ?? mainBasketClassifications.get(target.basketId) ?? "standard" }
          : line);
    });
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
  const saveBeforeNavigation = async (): Promise<boolean> => {
    if (navigationSaveInFlight.current || saveDisabled) return false;
    navigationSaveInFlight.current = true;
    setNavigationSaving(true);
    try { await save.mutateAsync(); return true; }
    catch { return false; }
    finally { navigationSaveInFlight.current = false; setNavigationSaving(false); }
  };
  const editBaskets = async () => {
    if (navigationSaveInFlight.current || save.isPending || submit.isPending) return;
    if (!historical && draftEditable && hasUnsavedChanges && !await saveBeforeNavigation()) return;
    setSelectedRevisionId(null);
    setTab("configure");
  };
  const verifySaveOutcome = async () => {
    const result = await saved.refetch();
    const input = unconfirmedSave.current;
    if (result.isSuccess && result.data && input &&
      (input.expectedVersion === undefined || (result.data.version ?? 0) > input.expectedVersion) &&
      estimateDraftFingerprint(result.data) === estimateDraftFingerprint(input)) {
      unconfirmedSave.current = null;
      setSaveOutcomeUnknown(false);
      rememberDraftSave(result.data, leadId, input, unconfirmedLines.current);
      save.reset();
      setNotice("Estimate save confirmed. You can continue editing.");
    } else {
      setNotice("The save could not be confirmed. Your edits are preserved. Review or reload the saved estimate before continuing.");
    }
  };
  const advanceWorkingVersion = (before: number, after: number) => {
    // These commands only change workflow/request metadata. Never rebase over an unrelated save.
    if (workingVersion.current === before && after === before + 1) workingVersion.current = after;
    setNotice("");
  };
  const reloadSavedEstimate = async () => {
    const result = await saved.refetch();
    if (result.isSuccess) {
      unconfirmedSave.current = null;
      setSaveOutcomeUnknown(false);
      hasHydratedSavedEstimate.current = false;
      setHydrationRequest((current) => current + 1);
      save.reset();
      submit.reset();
      setNotice("Latest saved estimate loaded.");
    }
  };
  const requestSubBasketRemoval = (scope: { roomId: string; mainBasketId: string; subBasketId: string }) => {
    if (!editable || save.isPending || submit.isPending) return;
    const line = configuredLines.find(item => item.roomId === scope.roomId && item.mainBasketId === scope.mainBasketId && item.subBasketId === scope.subBasketId && item.included);
    if (line) setPendingRemoval({ kind: "sub", ...scope, label: `${line.subBasketName ?? "Sub Basket"} in ${line.roomName}` });
  };
  const confirmRemoval = () => {
    if (!pendingRemoval || !editable || save.isPending || submit.isPending) return;
    if (pendingRemoval.kind === "basket") toggleMainBasket(pendingRemoval.mainBasketId!, true);
    else if (pendingRemoval.kind === "all") clearMainBaskets(true);
    else {
      setConfiguredLines(current => deselectConfiguredRecommendationSources(current,
        new Set(current.filter(line => line.included && line.roomId === pendingRemoval.roomId &&
          line.mainBasketId === pendingRemoval.mainBasketId && line.subBasketId === pendingRemoval.subBasketId).map(line => line.key))));
      }
    setPendingRemoval(null);
  };
  const projectNavigation = leadItem.projectId && (!saved.data?.projectId || saved.data.projectId === leadItem.projectId)
    ? <ProjectChatNavigation projectId={leadItem.projectId} overviewTo={`/estimator-sales/leads/${leadId}/estimate`} overviewLabel="Estimate" />
    : null;

  const boundedBuilder = !historical && tab === "builder" && configuredMode && Boolean(catalogue.data || hasConfiguredSaved);
  const currentTools = <>
    {saved.data ? <StaffEstimateCollaboration compact estimate={saved.data} disabled={saved.isFetching || saved.isError || save.isPending || submit.isPending || estimateVersionConflict} onVersionAdvance={advanceWorkingVersion} /> : null}
    {collaborative && leadItem.projectId ? <StaffEstimateRequirements compact projectId={leadItem.projectId} estimate={saved.data ?? null} disabled={save.isPending || submit.isPending || saved.isFetching || saved.isError || estimateVersionConflict} onVersionAdvance={advanceWorkingVersion} /> : null}
  </>;
  const returnToCurrent = () => { revisionFocusPending.current = true; setSelectedRevisionId(null); setHistoricalRoomId(null); setRevisionDownloadError(""); };
  const revisionItems = historyDenied ? [] : revisions.data?.pages.flatMap(page => page.items) ?? [];
  const hasRevisionNavigation = revisionItems.length > 0;
  const secondaryViewClass = `estimate-workspace__secondary-view${hasRevisionNavigation ? "" : " estimate-workspace__secondary-view--without-revisions"}`;
  const retryRevisionHistory = async () => {
    if (denied(saved.error)) { const result = await saved.refetch(); if (!result.isSuccess) return; }
    if (denied(lead.error)) { const result = await lead.refetch(); if (!result.isSuccess) return; }
    const result = await revisions.refetch();
    if (!result.isSuccess) return;
    if (historyAccessDenied) {
      queryClient.removeQueries({ queryKey: [...estimateRevisionKeys.estimate(estimateId, actorId), "detail"] });
      setDeniedHistoryScope(null);
    } else if (selectedRevisionId) await historicalDetail.refetch();
  };
  const revisionNavigation = <EstimateRevisionNavigation
    items={revisionItems}
    selectedRevisionId={selectedRevisionId}
    onSelectCurrent={returnToCurrent}
    onSelectRevision={id => { revisionFocusPending.current = true; setSelectedRevisionId(id); setHistoricalRoomId(null); setRevisionDownloadError(""); }}
    disabled={save.isPending || submit.isPending || sendToClient.isPending}
    loading={Boolean(estimateId && actorId) && revisions.isPending}
    error={historyDenied ? "Revision history is no longer available for this estimate." : revisions.isError ? "Revision history could not be loaded." : null}
    onRetry={() => void retryRevisionHistory()}
    hasMore={!historyDenied && revisions.hasNextPage}
    loadingMore={revisions.isFetchingNextPage}
    onLoadMore={() => void revisions.fetchNextPage()}
  />;
  const downloadSelectedRevision = async () => {
    const selected = selectedSnapshot;
    if (!selected || downloadingRevisionId) return;
    const controller = new AbortController();
    revisionDownloadController.current = controller;
    setDownloadingRevisionId(selected.id); setRevisionDownloadError("");
    try {
      const result = await downloadEstimateRevisionPdf(selected.estimateId, selected.id, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename?.replace(/[\\/]/g, "-") || `lisno-estimate-r${selected.sendGeneration}.pdf`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (denied(error)) setDeniedHistoryScope(historyAccessScope);
        setRevisionDownloadError(`The PDF for ${estimateRevisionLabel(selected)} could not be downloaded. Try again.`);
      }
    } finally {
      if (revisionDownloadController.current === controller) { revisionDownloadController.current = null; setDownloadingRevisionId(null); }
    }
  };
  const displayedAmount = historical
    ? selectedSnapshot ? moneyPaise(selectedSnapshot.subtotalPaise) : historicalDetail.isPending && !historyDenied ? "Loading…" : "Unavailable"
    : totalLabel(totals.subtotal);
  const backControl = tab === "configure" ? <Link to={returnTo ?? `/estimator-sales/leads/${leadId}`} className="estimate-workspace__back lead-detail__back-link">{returnTo ? "Back to design plans" : `Back to ${leadItem.clientName}`}</Link> :
    <button type="button" disabled={navigationSaving || save.isPending || submit.isPending || submissionLocked ||
      (!historical && draftEditable && hasUnsavedChanges && saveDisabled)} onClick={() => void editBaskets()}
      className="estimate-workspace__back lead-detail__back-link">
      {navigationSaving ? "Saving…" : historical || !draftEditable ? "View baskets" : hasUnsavedChanges ? "Save and edit baskets" : "Edit baskets"}
    </button>;
  const viewControls = tab !== "configure" ? <div className="estimate-workspace__view-controls">
    {backControl}
    <nav aria-label="Estimate views" className="estimate-workspace__tabs">{(["builder", "summary", "proposal"] as const).map(value =>
      <button type="button" key={value} disabled={navigationSaving} onClick={() => setTab(value)} aria-pressed={tab === value}><TabIcon tab={value} /> {value === "builder" ? "Estimate Builder" : value === "summary" ? "Summary" : "Proposal"}</button>
    )}</nav>
    <strong className="estimate-workspace__amount" aria-label={`Estimate amount before GST: ${displayedAmount}`}>{displayedAmount}</strong>
    {!historical ? <div className="estimate-workspace__current-tools">{currentTools}{historyDenied ? <button type="button" className="button button--secondary" disabled={revisions.isFetching || saved.isFetching || lead.isFetching} onClick={() => void retryRevisionHistory()}>Retry revisions</button> : null}</div> : null}
    {projectNavigation ? <div className="estimate-workspace__messages">{projectNavigation}</div> : null}
  </div> : null;
  return <section ref={workspaceRef} className={`estimate-workspace estimator-dashboard${tab === "configure" ? " estimate-workspace--configure-view" : " estimate-workspace--item-view estimate-workspace--revision-workspace"}${boundedBuilder || historical ? " estimate-workspace--compact-builder" : ""}`} aria-labelledby="estimate-title">
    {tab === "configure" ? <>
      {backControl}
      <header className="estimate-workspace__header"><div className="estimate-workspace__title"><p className="eyebrow">Estimate draft · {leadItem.clientName}</p><h1 id="estimate-title">Configure estimate</h1><p>{leadItem.projectName} · {leadItem.location}<ProjectId className="estimate-workspace__project-number" projectNumber={saved.data?.projectNumber ?? leadItem.projectNumber} /></p></div><div className="estimate-workspace__summary"><strong>{totalLabel(totals.total)}</strong><span>Total including GST</span></div></header>
      {projectNavigation}
    </> : <><h1 id="estimate-title" className="sr-only">Estimate workspace</h1>{viewControls}</>}
    {!historical && publicationBlocked ? <p className="estimate-notice" role="status">{quotationWorkflow ? "Resolve client requests before submitting this quotation." : "Submission is unavailable until client requests are resolved and the current design scope is approved for post-estimation."}</p> : null}
    {!historical && revision.isError ? <p role="alert">Quotation updates could not be checked. Your edits are preserved. <button type="button" className="button button--secondary" onClick={() => void revision.refetch()}>Retry updates</button></p> : null}
    {!historical && saved.isRefetchError ? <p role="alert">The saved estimate could not be refreshed. Your local edits are preserved; refresh before continuing.</p> : null}
    {!historical && saved.data?.clientReview ? <EstimateDeliveryStatus review={saved.data.clientReview} retrying={retryEmail.isPending} onRetry={() => retryEmail.mutate()} /> : null}
    {!historical && saved.data?.clientFeedback ? <EstimateClientFeedback feedback={saved.data.clientFeedback} editable={editable} refreshing={saved.isFetching} refreshFailed={saved.isRefetchError} onRefresh={() => void saved.refetch()} /> : null}
    {!historical && saved.data?.status === "client_changes_requested" ? <EstimatePlanChangeRequests estimateId={saved.data.id} /> : null}
    {tab === "configure" ? <>
      <EstimateSetupFields propertyType={effectivePropertyType} onPropertyTypeChange={changePropertyType}
        bedroomCountInput={bedroomCountInput} onBedroomCountChange={value => { if (!roomControlsDisabled && !submissionInFlight.current) setBedroomCountInput(value); }}
        variableBedroomCount={variableBedroomCount} bedroomCountRequired={bedroomSetupRequired} bedroomCountRef={bedroomCountRef}
        editable={draftEditable} disabled={roomControlsDisabled} roomOptions={roomSelectOptions} selectedRoomTypeIds={selectedRoomTypeIds}
        onRoomsChange={handleRoomsChange} retainedRooms={hasRetainedRooms}
        rooms={rooms.map(room => ({ id: room.id, label: room.label, icon: getRoomIcon(room.typeId), length: room.length, width: room.width }))}
        onDimensionChange={updateRoom} onRemoveRoom={removeRoom} />
      <EstimateSetupBaskets search={basketSearch} onSearchChange={setBasketSearch} searchRef={basketSearchRef} onClearSearch={clearBasketSearch}
        onRefresh={() => void refreshAvailableItems()} refreshing={catalogue.isFetching} showTools={configuredMode}>
        {!configuredMode ? <div className="configured-estimate-chooser__state"><p>This estimate contains historical items. You can keep editing them, or add current configured items.</p><button type="button" className="button button--secondary" onClick={() => setCatalogueRequested(true)}>Load configured baskets</button></div> : null}
        {configuredMode && catalogue.isPending ? <p role="status">Loading configured baskets…</p> : null}
        {configuredMode && catalogue.isFetching && catalogue.data ? <p role="status">Refreshing available items…</p> : null}
        {configuredMode && catalogue.isError ? <div className="configured-estimate-chooser__state" role="alert"><p>{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? "You do not have permission to read the estimator catalogue." : catalogue.data ? "The catalogue refresh failed. The last loaded baskets are shown; retry before adding items." : "Configured baskets could not be loaded. Try again before selecting items."}</p>{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? null : <button type="button" className="button button--secondary" onClick={() => void catalogue.refetch()}>Retry catalogue</button>}</div> : null}
        {configuredMode && catalogue.data && !catalogue.isError && !catalogue.data.items.length ? <p className="configured-estimate-chooser__state">No active Main Baskets are available in the estimator catalogue.</p> : null}
        {configuredMode && catalogue.data?.readyNonActiveSupported === false ? <p className="configured-estimate-chooser__note" role="status">This catalogue currently shows Active items only. Draft and Inactive items will become available when the catalogue service is updated.</p> : null}
        {configuredMode && catalogue.data?.ineligibleLineCount ? <p className="configured-estimate-chooser__note">{catalogue.data.ineligibleLineCount} configured {catalogue.data.ineligibleLineCount === 1 ? "item is" : "items are"} unavailable in the estimator catalogue. Availability depends on item completeness and a valid UOM.</p> : null}
        {configuredMode && catalogue.data ? <div className="configured-estimate-chooser__list">{visibleBaskets.map((basket) => <MainBasketSelectionCard key={basket.id} basket={basket} selected={selectedMainBasketIds.has(basket.id)} disabled={basketSelectionDisabled} onToggle={() => toggleMainBasket(basket.id)} />)}</div> : null}
        {configuredMode && (catalogue.data?.items.length ?? 0) > 0 && basketSearchTerm && !visibleBaskets.length ? <p className="configured-estimate-chooser__state" role="status">No baskets match your search.</p> : null}
      </EstimateSetupBaskets>
      {draftEditable ? <button type="button" className="button button--secondary estimate-setup-save" disabled={saveDisabled} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button> : null}
      {(saved.data?.lineItems.length ?? 0) > 0 ? <button type="button" className="button button--secondary estimate-continue" disabled={save.isPending || navigationSaving} onClick={() => setTab("builder")}>Return to saved items</button> : null}
      {configuredMode ? <ConfigureSelectionFooter count={selectedMainBasketIds.size} clearDisabled={basketSelectionDisabled || !selectedMainBasketIds.size} continueDisabled={basketSelectionDisabled || bedroomSetupRequired || !rooms.length || !selectedMainBasketIds.size} onClear={() => clearMainBaskets()} onContinue={buildLines} /> : null}
    </> : null}
    {!historical && tab !== "configure" && bedroomSetupRequired ? <div className="estimate-bedroom-count-required" role="status"><p>Enter the number of bedrooms in Configure before saving or submitting this estimate. Your saved rooms and items are kept.</p><button type="button" className="button button--secondary" disabled={roomControlsDisabled} onClick={() => { setTab("configure"); requestAnimationFrame(() => bedroomCountRef.current?.focus()); }}>Configure bedrooms</button></div> : null}
    {!historical && tab === "builder" && configuredMode && catalogue.isError ? <div className="configured-estimate-refresh">
      {catalogue.isError ? <p role="alert">{catalogue.error instanceof ApiError && catalogue.error.status === 403 ? "You do not have permission to read the estimator catalogue." : catalogue.data ? "Available items could not be refreshed. The last loaded catalogue is shown. Try again." : "Available items could not be loaded. Try again."}</p> : null}
    </div> : null}
    {boundedBuilder ? <EstimateBuilderArea>
      {!catalogue.data ? <p className="estimate-notice" role="status">Current Configuration is unavailable. Saved lines are shown from this estimate's snapshot.</p> : null}
      <ConfiguredEstimateBuilder
      navigation={revisionNavigation}
      viewState={builderViewState}
      onViewStateChange={setBuilderViewState}
      rooms={builderRooms}
      activeRoomId={activeRoomId}
      onSelectRoom={setActiveRoomId}
      catalogue={catalogue.data ?? { items: [], ineligibleLineCount: 0 }}
      selectedMainBasketIds={selectedMainBasketIds}
      mainBasketClassifications={mainBasketClassifications}
      lines={configuredLines}
      onUpdateLine={updateConfiguredLine}
      onAddLine={addConfiguredLine}
      onRemoveSubBasket={requestSubBasketRemoval}
      onRefreshAvailableItems={() => void refreshAvailableItems()}
      refreshingAvailableItems={catalogue.isFetching}
      availableItemsState={catalogue.isError ? "error" : catalogue.isFetching ? "loading" : "ready"}
      roomTotal={roomTotalPaise}
      roomIcons={roomIcons}
      moneyPaise={moneyPaise}
      editable={editable}
      recommendationSourceCount={recommendationSources.length + recommendationSourcePartition.historical.length + Number(recommendationSourcePartition.outdatedDraft)}
      recommendationState={recommendationState}
      recommendationView={recommendationView}
      recommendationContextKey={JSON.stringify([actorId, leadId, activeRoomId, recommendationIdentity])}
      excludedReviewKeys={new Set([...invalidConfiguredLines, ...changedUomConfiguredLines, ...unavailableConfiguredLines, ...legacyIncompatibleConfiguredLines]
        .filter(line => line.persistedId && !line.included).map(line => line.key))}
      reviewContextKey={JSON.stringify([actorId, leadId, saved.data?.version ?? null])}
      onRetryRecommendations={() => void recommendations.refetch()}
      onSelectRecommendedLine={selectRecommendedLine}
      onRemoveRecommendedLine={removeRecommendedLine}
    /></EstimateBuilderArea> : null}
    {!historical && tab === "builder" && lines.length ? <div className={!boundedBuilder ? secondaryViewClass : "estimate-workspace__secondary-view estimate-workspace__secondary-view--without-revisions"}>{!boundedBuilder && hasRevisionNavigation ? <aside className="estimate-workspace__revision-rail">{revisionNavigation}</aside> : null}<section aria-label="Earlier catalogue items"><h2>Earlier catalogue items</h2><EstimateBuilder
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
    /></section></div> : null}
    {!historical && tab === "summary" ? <div className={secondaryViewClass}>{hasRevisionNavigation ? <aside className="estimate-workspace__revision-rail">{revisionNavigation}</aside> : null}<section className="estimate-panel estimate-summary"><h2>Estimate summary</h2>{rooms.map((room) => <div className="estimate-summary-row" key={room.id}><span><RoomIcon typeId={room.typeId} /> <strong>{room.label}</strong><small>{lines.filter((line) => line.roomName === room.label && line.included).length + configuredLines.filter((line) => line.roomId === room.id && line.included).length} selected items</small></span><strong>{roomTotalLabel(room.id)}</strong></div>)}{hasMissingRate ? <p role="status">Total incomplete: enter the selling rate for {incompleteConfiguredLines.length} selected items.</p> : null}{invalidSelectedAmountCount ? <p role="status">Total incomplete: correct the quantity or price for {invalidSelectedAmountCount} selected items.</p> : null}<div className="estimate-total-card"><span>Sub-total <strong>{totalLabel(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{totalLabel(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{totalLabel(totals.total)}</strong></span></div></section></div> : null}
    {!historical && tab === "proposal" ? <div className={secondaryViewClass}>{hasRevisionNavigation ? <aside className="estimate-workspace__revision-rail">{revisionNavigation}</aside> : null}<section className="estimate-panel estimate-proposal"><header><p className="eyebrow">Lisno interior proposal</p><h2>{leadItem.projectName}</h2><p>Prepared for {leadItem.clientName}</p></header>{rooms.map((room) => <article key={room.id}><h3><RoomIcon typeId={room.typeId} /> {room.label}</h3>{selectedLines.filter((line) => line.roomName === room.label).map((line) => <div key={line.id}><span>{catalogueRows.find((row) => row.id === line.catalogueId)?.description ?? line.catalogueId}<small>{line.specification} · {line.quantity} {line.unit}</small></span><strong>{money(Math.round(line.quantity * line.rate))}</strong></div>)}{selectedConfiguredLines.filter((line) => line.roomId === room.id).map((line) => <div key={line.key}><span>{line.mainLineName}<small>{line.mainBasketName}{line.subBasketName ? ` / ${line.subBasketName}` : ""} · {line.itemType === "temporary" ? "Temporary item" : "Main Line"} · {line.quantity} {line.uomName} · {configuredUsesComponentPricing(line) ? "Calculated from components" : parseSellingRate(line.rateInput).kind === "blank" ? "Rate required" : `₹${line.rateInput} per ${line.uomName}`}</small></span><strong>{configuredLineAmountPaise(line) === null ? "Incomplete" : moneyPaise(configuredLineAmountPaise(line) ?? 0)}</strong></div>)}</article>)}{hasMissingRate ? <p role="status">This proposal is incomplete until every selected item has a selling rate.</p> : null}{invalidSelectedAmountCount ? <p role="status">This proposal is incomplete until the highlighted quantities or prices are corrected.</p> : null}<div className="estimate-total-card"><span>Sub-total <strong>{totalLabel(totals.subtotal)}</strong></span><span>GST @ 18% <strong>{totalLabel(totals.gst)}</strong></span><span>Total (incl. GST) <strong>{totalLabel(totals.total)}</strong></span></div><p className="estimate-terms">Valid for 30 days. Rates subject to material market changes. Final scope on site measurement. GST as applicable.</p></section></div> : null}
    {historical && tab !== "configure" ? <EstimateBuilderArea className="estimate-workspace__history-area">
      {selectedSnapshot ? <EstimateRevisionView revision={selectedSnapshot} view={tab} activeRoomId={historicalRoomId} onSelectRoom={setHistoricalRoomId} navigation={revisionNavigation} /> : <div className={secondaryViewClass}>{hasRevisionNavigation ? <aside className="estimate-workspace__revision-rail">{revisionNavigation}</aside> : null}<div className="estimate-workspace__history-state">
        {historyDenied ? <div role="alert"><p>This revision is no longer available for your current access.</p><button type="button" className="button button--secondary" disabled={revisions.isFetching || saved.isFetching || lead.isFetching} onClick={() => void retryRevisionHistory()}>Retry revisions</button></div> : historicalDetail.isError || historicalDetail.isSuccess && !selectedSnapshot ? <div role="alert"><p>The selected revision could not be loaded.</p><button type="button" className="button button--secondary" onClick={() => void historicalDetail.refetch()}>Retry revision</button></div> : <p role="status">Loading selected revision…</p>}
      </div></div>}
    </EstimateBuilderArea> : null}
    {!historical && tab !== "configure" ? <footer className="estimate-workspace__footer"><div><strong>{hasIncompleteConfiguredTotal ? "Total incomplete" : `${money(totals.subtotal)} total`}</strong><span>{includedItemCount} selected line {includedItemCount === 1 ? "item" : "items"} across {rooms.length} {rooms.length === 1 ? "room" : "rooms"} · {saved.data?.status?.replaceAll("_", " ") ?? "draft"}</span></div><div className="estimate-actions">{draftEditable ? <button type="button" className="button button--secondary" disabled={saveDisabled} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button> : null}{draftEditable && canPublish ? <button type="button" className="button button--primary estimate-continue" disabled={!submitAllowed} onClick={event => requestPublication("submit", event.currentTarget)}>{submit.isPending ? "Submitting…" : quotationWorkflow ? lifecycle?.phase === "post" ? "Send revised quotation to Client" : "Approve and send to client" : lifecycle?.phase === "post" ? "Submit final estimate" : collaborative ? "Submit pre-estimate" : "Submit estimate"}</button> : null}{saved.data?.status === "ready_for_client" && canPublish ? <button type="button" className="button button--primary" disabled={!sendAllowed} onClick={event => requestPublication("send", event.currentTarget)}>{sendToClient.isPending ? "Sending…" : quotationWorkflow && lifecycle?.phase === "pre" ? "Approve and send to client" : quotationWorkflow ? "Send revised quotation to Client" : "Send to client"}</button> : null}</div></footer> : null}
    {historical && tab !== "configure" ? <footer className="estimate-workspace__footer"><div><strong aria-label={`Estimate amount before GST: ${displayedAmount}`}>{displayedAmount}</strong><span>{selectedSnapshot ? `${estimateRevisionLabel(selectedSnapshot)} · Read-only` : "Saved revision · Read-only"}</span></div><div className="estimate-actions"><button type="button" className="button button--secondary" onClick={returnToCurrent}>Return to current estimate</button><button type="button" className="button button--primary" disabled={!selectedSnapshot || downloadingRevisionId !== null} onClick={() => void downloadSelectedRevision()}>{downloadingRevisionId === selectedRevisionId ? "Downloading…" : "Download revision"}</button></div></footer> : null}
    {historical && revisionDownloadError ? <p role="alert" className="estimate-notice estimate-notice--error">{revisionDownloadError}</p> : null}
    <EstimateNavigationGuard dirty={hasUnsavedChanges} busy={save.isPending || submit.isPending || navigationSaving} saveDisabled={saveDisabled} onSave={saveBeforeNavigation} />
    {!historical ? <>
    {pendingPublication ? <EstimateSubmissionChecklist action={pendingPublication.action}
      busy={submit.isPending || sendToClient.isPending}
      canConfirm={pendingPublication.context === publicationContext && (pendingPublication.action === "submit" ? submitAllowed : sendAllowed)}
      returnFocusRef={publicationTriggerRef} fallbackFocusRef={workspaceRef}
      onClose={() => { if (!publicationInFlight.current) setPendingPublication(null); }} onConfirm={confirmPublication} /> : null}
    {pendingRemoval ? <Dialog title={`Remove ${pendingRemoval.label}?`} eyebrow="Estimate selection" role="alertdialog"
      description={pendingRemoval.kind === "sub" ? "All selected items in this Sub Basket will be removed from this room. Save the draft to keep this change." : "All selected items in this Main Basket selection will be removed across the estimate's rooms. Save the draft to keep this change."}
      busy={save.isPending || submit.isPending} fallbackFocusRef={workspaceRef} onClose={() => setPendingRemoval(null)}>
      <div className="ui-dialog__actions"><button type="button" className="button button--secondary" onClick={() => setPendingRemoval(null)}>Keep items</button><button type="button" className="button button--primary" disabled={!editable || save.isPending || submit.isPending} onClick={confirmRemoval}>Remove from estimate</button></div>
    </Dialog> : null}
    {saveOutcomeUnknown ? <div role="alert" className="estimate-notice estimate-notice--error"><p>The save response could not be confirmed. Your edits are preserved. Verify the saved estimate before saving again.</p><button type="button" className="button button--secondary" disabled={saved.isFetching} onClick={() => void verifySaveOutcome()}>Verify saved estimate</button><button type="button" className="button button--secondary" disabled={saved.isFetching} onClick={() => void reloadSavedEstimate()}>Reload saved estimate (discard edits)</button></div> : null}
    {invalidComponentLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">Choose valid In-house components for every included In-house line before saving.</p> : null}
    {invalidDimensionLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">Complete and confirm the required dimensions before saving.</p> : null}
    {componentPricingPending ? <p className="estimate-notice" role="status">Complete the In-house component calculation before saving or submitting.</p> : null}
    {invalidConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">Correct the highlighted rate or quantity before saving.</p> : null}
    {unavailableConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">A Main Line is no longer available in Configuration. Refresh available items or remove it before saving.</p> : null}
    {changedUomConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">Configuration changed a line's unit. Re-enter its quantity in the builder before saving.</p> : null}
    {legacyIncompatibleConfiguredLines.length ? <p className="estimate-notice estimate-notice--error" role="alert">{catalogue.data?.readyNonActiveSupported === false ? "This catalogue service cannot save temporary items yet. Keep this estimate open and refresh after the service is updated." : "Refresh available items before saving temporary items in this estimate."}</p> : null}
    {estimateVersionConflict && !saveOutcomeUnknown ? <div className="estimate-notice estimate-notice--error" role="alert"><p>This estimate changed elsewhere. Reload the latest saved estimate before editing it again.</p><p>Your local edits are preserved. Review or copy them before reloading.</p><button type="button" className="button button--secondary" onClick={() => void reloadSavedEstimate()}>Reload saved estimate (discard edits)</button></div> : [save.error, submit.error].some((error) => error instanceof ApiError && ["ESTIMATE_CATALOGUE_CHANGED", "ESTIMATE_UOM_CHANGED", "ESTIMATE_CONFIGURATION_UNAVAILABLE", "ESTIMATE_CONFIGURATION_CHANGED"].includes(error.code)) ? <div className="estimate-notice estimate-notice--error" role="alert"><p>Configuration changed since you opened this estimate. Refresh available items and check the selected lines before saving.</p><button type="button" className="button button--secondary" onClick={() => void refreshAvailableItems()}>Refresh catalogue</button></div> : save.isError || submit.isError || sendToClient.isError ? <p className="estimate-notice estimate-notice--error" role="alert"><span>The estimate action could not be completed. Check the current workflow state and try again.</span>{[save.error, submit.error, sendToClient.error].find((error): error is ApiError => error instanceof ApiError)?.message ? <span> {[save.error, submit.error, sendToClient.error].find((error): error is ApiError => error instanceof ApiError)!.message}</span> : null}</p> : null}{retryError ? <p className="estimate-notice estimate-notice--error" role="alert">{retryError}</p> : null}{notice ? <p className="estimate-notice" role="status">{notice}</p> : null}
    </> : null}
  </section>;
}
