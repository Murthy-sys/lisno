import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useScaffoldNavigationGuard } from "../../navigation/AdaptiveAppScaffold";
import { useBackInterceptor } from "../../navigation/useScreenBack";
import { BrandLoader } from "../../ui/brand";
import { StateView } from "../../ui/primitives";
import { colors, fonts } from "../../ui/tokens";
import { KNOWLEDGE_MASTER_TYPES, type KnowledgeItemDetail, type KnowledgeJsonObject, type KnowledgeMaster, type KnowledgeMasterType, type KnowledgeSectionEnvelope } from "../../../../shared/knowledge/knowledgeTypes";
import { KNOWLEDGE_WORKSPACE_SECTION_LABELS, formatKnowledgeDateTime } from "../../../../shared/knowledge/knowledgePresentation";
import type { KnowledgeWorkspaceSectionKey } from "../../../../shared/knowledge/knowledgeWorkspaceSections";
import { validateKnowledgeSection } from "../../../../shared/knowledge/knowledgeSectionValidation";
import { modeCalculationsIssues } from "../../../../shared/knowledge/knowledgeModeCalculation";
import { modeDescriptionIssues } from "../../../../shared/knowledge/knowledgeModeDescription";
import { parseKnowledgeModeConfigurations } from "../../../../shared/knowledge/knowledgeModeConfiguration";
import { pmcMarginRangeIssues, subVendorMarginRangeIssues } from "../../../../shared/knowledge/knowledgePmcMargin";
import { projectKnowledgeSavedSummary } from "../../../../shared/knowledge/knowledgeSavedSummary";
import type { SavedSummaryGroupKey } from "../../../../shared/knowledge/knowledgeSavedSummaryTypes";
import { KnowledgeOverviewEditor } from "./KnowledgeOverviewEditor";
import { KnowledgeModeEditor } from "./KnowledgeModeEditor";
import { KnowledgeRecommendationsEditor } from "./KnowledgeRecommendationsEditor";
import { KnowledgeQualityEditor } from "./KnowledgeQualityEditor";
import type { KnowledgeSaveHandle } from "./knowledgeEditorContracts";
import { allKnowledgePages, useKnowledgeContext, type KnowledgeMobileContext } from "./knowledgeRuntime";
import { changedPayloadFields, MOBILE_SECTION_KEYS, rebaseKnowledgeDraft, saveKnowledgeDrafts, type KnowledgeDrafts, type MobileSectionKey } from "./knowledgeWorkspaceDraft";
import { Button, Field, DetailIcon, IconButton, KnowledgeCard, KnowledgeDetailProvider, KnowledgeDisclosure, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as styles } from "./knowledgeDetailUi";

interface Props {
  readonly session: AuthenticatedSession;
  readonly mainLineId: string;
  readonly onBack: () => void;
  readonly onOpenItem?: (mainLineId: string) => void;
}

export function KnowledgeItemWorkspace(props: Props) {
  const context = useKnowledgeContext(props.session);
  return <KnowledgeDetailProvider><Workspace key={`${context.scopeKey}:${props.mainLineId}`} {...props} context={context} /></KnowledgeDetailProvider>;
}

type Command = "revision" | "duplicate" | "activate" | "deactivate" | "delete" | "rename";
interface Conflict { readonly key: MobileSectionKey; readonly remote: KnowledgeSectionEnvelope; readonly item: KnowledgeItemDetail }

function Workspace({ mainLineId, onBack, onOpenItem, context }: Props & { readonly context: KnowledgeMobileContext }) {
  const client = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const headerEnd = useRef(0);
  const scrollOffset = useRef(0);
  const navigation = useScaffoldNavigationGuard();
  const [showActions, setShowActions] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [active, setActive] = useState<KnowledgeWorkspaceSectionKey>("overview");
  const [selectedRevision, setSelectedRevision] = useState("");
  const [drafts, setDrafts] = useState<KnowledgeDrafts>({});
  const draftsRef = useRef(drafts); draftsRef.current = drafts;
  const aggregateBase = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [qualityDirty, setQualityDirty] = useState(false);
  const [qualityBusy, setQualityBusy] = useState(false);
  const qualityRef = useRef<KnowledgeSaveHandle>(null);
  const [editorValid, setEditorValid] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [commandSnapshot, setCommandSnapshot] = useState<KnowledgeItemDetail | null>(null);
  const [commandConflict, setCommandConflict] = useState(false);
  const [command, setCommand] = useState<Command | null>(null);
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [expandedSummary, setExpandedSummary] = useState<SavedSummaryGroupKey | null>(null);
  const enabled = context.canRead && context.ready;
  const detailQuery = useQuery({ queryKey: context.key("detail", mainLineId), queryFn: () => context.api.getKnowledgeItem(mainLineId), enabled });
  const historyQuery = useQuery({ queryKey: context.key("history", mainLineId), queryFn: () => allKnowledgePages(page => context.api.getKnowledgeHistory(mainLineId, page)), enabled });
  const item = detailQuery.data;
  const revisions = historyQuery.data ?? [];
  const revisionId = selectedRevision || item?.draftRevisionId || item?.activeRevisionId || "";
  const revision = revisions.find(value => value.id === revisionId) ?? (item?.draftRevision?.id === revisionId ? item.draftRevision : item?.activeRevision?.id === revisionId ? item.activeRevision : undefined);
  const sectionQueries = useQueries({ queries: MOBILE_SECTION_KEYS.map(section => ({ queryKey: context.key("section", mainLineId, revisionId, section), queryFn: () => context.api.getKnowledgeSection(mainLineId, revisionId, section), enabled: enabled && Boolean(revisionId) })) });
  const masterQueries = useQueries({ queries: KNOWLEDGE_MASTER_TYPES.map(type => ({ queryKey: context.key("masters", type), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeMasters(type, { ...page, includeArchived: true })), enabled })) });
  const masters = Object.fromEntries(KNOWLEDGE_MASTER_TYPES.map((type, index) => [type, masterQueries[index]?.data ?? []])) as Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>;
  const catalogsReady = masterQueries.every(query => query.isSuccess);
  const basketQuery = useQuery({ queryKey: context.key("baskets", "all"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets({ ...page, includeArchived: true })), enabled });
  const relatedQuery = useQuery({ queryKey: context.key("items", "all"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeItems(page)), enabled });
  const qualityQuery = useQuery({ queryKey: context.key("basket-quality", item?.basketId), queryFn: () => context.api.getKnowledgeBasketQuality(item!.basketId), enabled: enabled && Boolean(item?.basketId) });
  const subBasketsQuery = useQuery({ queryKey: context.key("sub-baskets", item?.basketId), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeSubBaskets(item!.basketId, page)), enabled: enabled && Boolean(item?.basketId) });
  const saved = Object.fromEntries(MOBILE_SECTION_KEYS.map((key, index) => [key, sectionQueries[index]?.data])) as Partial<Record<MobileSectionKey, KnowledgeSectionEnvelope>>;
  const editable = Boolean(item && revision?.status === "draft" && item.status !== "archived" && context.canUpdate && item.allowedActions.includes("update_section"));
  const dirty = Object.keys(drafts).length > 0 || qualityDirty;
  const locked = busy || qualityBusy || editorBusy;

  useEffect(() => { navigation?.setBlocked(dirty || locked); return () => navigation?.setBlocked(false); }, [navigation, dirty, locked]);
  function requestNavigation(next: () => void) {
    if (busyRef.current || qualityBusy || editorBusy) return;
    if (dirty) setPendingNavigation(() => next); else { setError(""); next(); }
  }
  useBackInterceptor(() => {
    if (locked) return true;
    if (pendingNavigation) { setPendingNavigation(null); return true; }
    if (command) { setCommand(null); return true; }
    requestNavigation(onBack); return true;
  });
  function change(key: MobileSectionKey, payload: KnowledgeJsonObject) {
    if (!editable || busyRef.current) return;
    const base = draftsRef.current[key]?.base ?? saved[key];
    if (!base) return;
    const next = { ...draftsRef.current, [key]: { base, payload } };
    if (!changedPayloadFields(next[key]!).length) delete next[key];
    if (aggregateBase.current === null && Object.keys(next).length) aggregateBase.current = item!.version;
    if (!Object.keys(next).length) aggregateBase.current = null;
    draftsRef.current = next; setDrafts(next); setNotice(""); setError("");
  }
  function discard() {
    draftsRef.current = {}; setDrafts({}); aggregateBase.current = null;
    qualityRef.current?.discard(); setQualityDirty(false); setError(""); setConflict(null); setEditorValid(true); setEditorGeneration(value => value + 1);
  }
  async function save(): Promise<boolean> {
    if (active === "quality") return qualityRef.current?.save() ?? false;
    if (!item || !editable || busyRef.current || editorBusy || conflict || !revisionId) return false;
    const current = draftsRef.current;
    if (!Object.keys(current).length) return true;
    const issues = Object.entries(current).flatMap(([key, draft]) => {
      if (!draft) return [];
      const general = validateKnowledgeSection(key as MobileSectionKey, draft.payload, { currentMainLineId: mainLineId, uoms: masters.uoms ?? [], vendors: masters.vendors ?? [], uomCatalogStatus: catalogsReady ? "ready" : "error", vendorCatalogStatus: catalogsReady ? "ready" : "error" });
      return key === "advanced" ? [...general, ...parseKnowledgeModeConfigurations(draft.payload.modeConfigurations, masters.modes ?? []).issues, ...modeCalculationsIssues(draft.payload), ...modeDescriptionIssues(draft.payload.modeDescription), ...pmcMarginRangeIssues(draft.payload), ...subVendorMarginRangeIssues(draft.payload)] : general;
    });
    if (!editorValid || issues.length) { setError(issues.map(issue => issue.message).slice(0, 5).join("\n") || "Complete the highlighted fields before saving."); return false; }
    busyRef.current = true; setBusy(true); setError("");
    let attempted: MobileSectionKey = active === "mode" ? "advanced" : active;
    try {
      await saveKnowledgeDrafts({ api: context.api, mainLineId, revisionId, aggregateVersion: aggregateBase.current ?? item.version, drafts: current,
        onAttempt: key => { attempted = key; },
        onSaved: (key, result) => {
          aggregateBase.current = result.aggregateVersion;
          client.setQueryData(context.key("section", mainLineId, revisionId, key), result);
          client.setQueryData<KnowledgeItemDetail>(context.key("detail", mainLineId), old => old ? { ...old, version: result.aggregateVersion, updatedAt: result.updatedAt } : old);
          const next = { ...draftsRef.current }; delete next[key]; draftsRef.current = next; setDrafts(next);
        }
      });
      aggregateBase.current = null; setNotice("Configuration saved.");
      await context.refresh().catch(() => setNotice("Configuration saved. Refresh to load the latest summary."));
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") {
        setError("This configuration changed elsewhere. Your unsaved changes are retained. Review the latest version before saving again.");
        try {
          const [remote, latestItem] = await Promise.all([context.api.getKnowledgeSection(mainLineId, revisionId, attempted), context.api.getKnowledgeItem(mainLineId)]);
          setConflict({ key: attempted, remote, item: latestItem });
        } catch { setError("Your changes are retained, but the latest version could not be loaded. Retry when connected."); }
      } else setError(cause instanceof ApiError ? cause.message : "Could not save. Your unsaved changes are retained.");
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function continueAfterSave() {
    const next = pendingNavigation;
    if (await save()) { setPendingNavigation(null); next?.(); }
  }
  function openCommand(next: Command) {
    setShowActions(false);
    requestNavigation(() => { setReason(""); setName(next === "duplicate" ? `${item?.mainLineName ?? ""} copy` : item?.mainLineName ?? ""); setConfirmation(""); setError(""); setCommandSnapshot(item ?? null); setCommandConflict(false); setCommand(next); });
  }
  async function submitCommand() {
    if (!item || !commandSnapshot || !command || commandConflict || busyRef.current) return;
    const target = commandSnapshot;
    if (!["rename", "activate"].includes(command) && !reason.trim()) { setError("Enter a reason."); return; }
    if (command === "delete" && confirmation !== target.mainLineName) { setError("Enter the Main Line name exactly to confirm deletion."); return; }
    const canRun = command === "rename" ? context.canUpdate && item.status !== "archived" : command === "revision" ? context.canCreate && item.allowedActions.includes("create_revision") : command === "duplicate" ? context.canCreate && item.allowedActions.includes("duplicate") : context.canLifecycle && item.allowedActions.includes(command === "activate" ? "review_and_activate" : command === "deactivate" ? "deactivate" : "archive");
    if (!canRun) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const input = { expectedVersion: target.version, reason: reason.trim() };
      if (command === "delete") {
        await context.api.permanentlyDeleteKnowledgeMainLine(mainLineId, input);
        await context.refresh().catch(() => undefined); setCommand(null); onBack(); return;
      }
      const result = command === "revision" ? await context.api.createKnowledgeRevision(mainLineId, input)
        : command === "duplicate" ? await context.api.duplicateKnowledgeItem(mainLineId, { ...input, name: name.trim() })
          : command === "activate" ? await context.api.activateKnowledgeRevision(mainLineId, target.draftRevision!.id, input)
            : command === "deactivate" ? await context.api.deactivateKnowledgeItem(mainLineId, input)
              : await context.api.updateKnowledgeMainLine(mainLineId, { expectedVersion: target.version, name: name.trim() });
      client.setQueryData(context.key("detail", result.mainLineId), result);
      setSelectedRevision(""); setCommand(null); setNotice("Configuration updated.");
      await context.refresh().catch(() => setNotice("Saved. Refresh to load the latest summary."));
      if (result.mainLineId !== mainLineId) onOpenItem?.(result.mainLineId);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT") { setCommandConflict(true); setError("This item changed elsewhere. Close this dialog, refresh and review it before trying again. Your entries remain visible."); void detailQuery.refetch(); }
      else setError(cause instanceof ApiError ? cause.message : "The action could not be completed. Your entries are retained.");
    }
    finally { busyRef.current = false; setBusy(false); }
  }

  if (!context.canRead) return <StateView title="Configuration unavailable" message="Your current access does not allow this Configuration workspace." tone="denied" />;
  if (!item && detailQuery.isPending) return <BrandLoader label="Loading Configuration" tone="dark" />;
  if (!item || (detailQuery.error instanceof ApiError && [401, 403, 404].includes(detailQuery.error.status))) return <StateView title="Configuration unavailable" message="This item could not be loaded." actionLabel="Retry" onAction={() => void detailQuery.refetch()} />;
  const tabKeys: readonly KnowledgeWorkspaceSectionKey[] = item.itemType === "temporary" ? ["overview", "mode", "quality"] : ["overview", "mode", "recommendations", "quality"];
  const keys = active === "mode" ? ["advanced", "pricing"] as const : active === "quality" ? [] : [active];
  const loading = keys.some(key => sectionQueries[MOBILE_SECTION_KEYS.indexOf(key)]?.isPending);
  const failed = keys.some(key => sectionQueries[MOBILE_SECTION_KEYS.indexOf(key)]?.isError);
  const sectionPayload = (key: MobileSectionKey) => drafts[key]?.payload ?? saved[key]?.payload ?? {};
  const editorProps = { item, context, masters, catalogsReady, readOnly: !editable || locked, onValidityChange: setEditorValid, onBusyChange: setEditorBusy };
  const summary = projectKnowledgeSavedSummary({ sections: Object.fromEntries(MOBILE_SECTION_KEYS.filter(key => saved[key]).map(key => [key, saved[key]!.payload])), ...(qualityQuery.data ? { quality: qualityQuery.data } : {}), masters, baskets: basketQuery.data ?? [], items: relatedQuery.data ?? [], subBaskets: subBasketsQuery.data ?? [] });
  const canSave = active === "quality" ? context.canUpdate && item.status !== "archived" : editable;
  const hasActions = context.canCreate && item.allowedActions.some(action => ["create_revision", "duplicate"].includes(action)) || context.canLifecycle && item.allowedActions.some(action => ["review_and_activate", "deactivate", "archive"].includes(action));
  const findings = [...item.blockers, ...item.warnings];
  return <View style={detail.root}>
    <ScrollView ref={scroll} style={detail.scroll} contentContainerStyle={styles.screen} stickyHeaderIndices={[1]} onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} keyboardShouldPersistTaps="handled">
    <View style={detail.header} onLayout={event => { headerEnd.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height + 10; }}>
    <View style={detail.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Main Baskets" disabled={locked} accessibilityState={{ disabled: locked }} onPress={() => requestNavigation(onBack)} style={detail.back}><DetailIcon name="back" size={17} /><Text style={detail.backText}>Main Baskets</Text></Pressable>
      {hasActions ? <Pressable accessibilityRole="button" accessibilityLabel="Item actions" accessibilityState={{ expanded: showActions, disabled: locked }} disabled={locked} onPress={() => setShowActions(value => !value)} style={detail.back}><DetailIcon name="more" /><Text style={detail.backText}>Actions</Text></Pressable> : null}
    </View>
    <View style={detail.heading}><Text accessibilityRole="header" style={detail.title}>{item.mainLineName}</Text>{context.canUpdate && item.status !== "archived" ? <IconButton label="Edit Main Line" icon="edit" variant="quiet" disabled={locked} onPress={() => openCommand("rename")} /> : null}</View>
    <View style={detail.metadata}><Text style={[styles.text, { flex: 1 }]}>{item.basketName}{item.subBasketName ? ` · ${item.subBasketName}` : ""}</Text><Text style={detail.status}>{item.status}</Text></View>
    {showActions ? <KnowledgeCard title="Item actions">
    <View style={styles.row}>
      {context.canCreate && item.allowedActions.includes("create_revision") ? <Button label="Create Draft revision" variant="secondary" disabled={locked} onPress={() => openCommand("revision")} /> : null}
      {context.canCreate && item.allowedActions.includes("duplicate") ? <Button label="Duplicate" variant="secondary" disabled={locked} onPress={() => openCommand("duplicate")} /> : null}
      {context.canLifecycle && item.allowedActions.includes("review_and_activate") ? <Button label="Review and activate" disabled={locked || item.blockers.length > 0} onPress={() => openCommand("activate")} /> : null}
      {context.canLifecycle && item.allowedActions.includes("deactivate") ? <Button label="Deactivate" variant="secondary" disabled={locked} onPress={() => openCommand("deactivate")} /> : null}
      {context.canLifecycle && item.allowedActions.includes("archive") ? <Button label="Delete" variant="danger" disabled={locked} onPress={() => openCommand("delete")} /> : null}
    </View>
    </KnowledgeCard> : null}
    <View style={detail.completeness}>
      <View style={detail.progressRow}>
        <Text style={detail.percent}>{item.completeness.percentage}%<Text style={detail.completeLabel}> complete</Text></Text>
        <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: item.completeness.percentage }} accessibilityLabel="Configuration completeness" style={detail.track}><View style={[detail.fill, { width: `${Math.max(0, Math.min(100, item.completeness.percentage))}%` }]} /></View>
        {findings.length ? <Pressable accessibilityRole="button" accessibilityLabel="Configuration checks" accessibilityHint={item.blockers.length ? `${item.blockers.length} required before activation` : `${item.warnings.length} configuration notes`} accessibilityState={{ expanded: showChecks }} onPress={() => setShowChecks(value => !value)} style={detail.checksToggle}><Text style={detail.checksLabel}>{item.blockers.length ? `${item.blockers.length} to finish` : "Details"}</Text><DetailIcon name={showChecks ? "down" : "right"} size={14} /></Pressable> : null}
      </View>
      {showChecks ? <View style={detail.findings}>{item.blockers.map((finding, index) => <KnowledgeText key={`blocker-${index}`} error>{friendlyFinding(finding.message)}</KnowledgeText>)}{item.warnings.map((finding, index) => <KnowledgeText key={`warning-${index}`}>{friendlyFinding(finding.message)}</KnowledgeText>)}<KnowledgeText>Knowledge-base changes do not modify current estimates or the existing Sales estimate builder.</KnowledgeText></View> : null}
    </View>
    {detailQuery.isError ? <KnowledgeCard><KnowledgeText error>The latest item could not be refreshed. Cached content and your edits are retained.</KnowledgeText><Button label="Retry item refresh" variant="secondary" onPress={() => void detailQuery.refetch()} /></KnowledgeCard> : null}
    {error ? <KnowledgeText error>{error}</KnowledgeText> : null}{notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
    {historyQuery.isError ? <Button label="Retry revision history" variant="secondary" onPress={() => void historyQuery.refetch()} /> : null}
    </View>
    <View style={detail.tabDock}><View accessibilityRole="tablist" style={detail.tabs}>{tabKeys.map(key => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={KNOWLEDGE_WORKSPACE_SECTION_LABELS[key]} accessibilityState={{ selected: active === key, disabled: locked }} disabled={locked} onPress={() => requestNavigation(() => { setActive(key); setEditorValid(true); scroll.current?.scrollTo({ y: Math.min(scrollOffset.current, headerEnd.current), animated: false }); })} style={[detail.tab, { flex: key === "recommendations" ? 1.8 : key === "quality" ? 1.35 : 1 }, active === key && detail.activeTab]}><Text style={[detail.tabText, active === key && detail.activeTabText]}>{MOBILE_TAB_LABELS[key]}</Text></Pressable>)}</View></View>
    {!editable && active !== "quality" ? <KnowledgeText>This revision is read-only. Create a Draft revision to edit Configuration.</KnowledgeText> : null}
    {!catalogsReady ? <View style={styles.stack}><KnowledgeText>Reusable values are {masterQueries.some(query => query.isError) ? "unavailable" : "loading"}. Saved selections are retained.</KnowledgeText>{masterQueries.some(query => query.isError) ? <Button label="Retry reusable values" variant="secondary" onPress={() => { masterQueries.forEach(query => void query.refetch()); }} /> : null}</View> : null}
    {active === "quality" ? <KnowledgeQualityEditor key={`${mainLineId}:${revisionId}`} ref={qualityRef} embedded item={item} context={context} revisionId={revisionId} onDirtyChange={setQualityDirty} onBusyChange={setQualityBusy} />
      : !revisionId ? <KnowledgeText>No revision is available.</KnowledgeText>
        : loading ? <BrandLoader label={`Loading ${KNOWLEDGE_WORKSPACE_SECTION_LABELS[active]}`} tone="dark" />
          : failed ? <StateView title="Section could not be loaded" message="Your saved configuration is retained. Retry before editing." actionLabel="Retry section" onAction={() => { keys.forEach(key => void sectionQueries[MOBILE_SECTION_KEYS.indexOf(key)]?.refetch()); }} />
            : active === "overview" ? <KnowledgeOverviewEditor key={`${revisionId}:${editorGeneration}`} {...editorProps} payload={sectionPayload("overview")} onChange={value => change("overview", value)} />
              : active === "mode" ? <KnowledgeModeEditor key={`${revisionId}:${editorGeneration}`} {...editorProps} payload={sectionPayload("advanced")} onChange={value => change("advanced", value)} pricingPayload={sectionPayload("pricing")} onPricingChange={value => change("pricing", value)} overviewPayload={saved.overview?.payload ?? {}} referencedSpecificationIds={saved.pricing?.referenceState?.specificationIds ?? []} />
                : <KnowledgeRecommendationsEditor key={`${revisionId}:${editorGeneration}`} {...editorProps} payload={sectionPayload("recommendations")} onChange={value => change("recommendations", value)} />}
    <KnowledgeDisclosure title="Quick summary" summary="Saved configuration details">
      {[["Main Basket", item.basketName], ["Sub-Basket", item.subBasketName ?? "Not assigned"], ["Main Line", item.mainLineName]].map(([label, value]) => <View key={label} style={styles.summaryRow}><Text style={[styles.text, { flex: 1 }]}>{label}</Text><Text style={[styles.subtitle, { flex: 1 }]}>{value}</Text></View>)}
      <KnowledgeText>Saved configuration</KnowledgeText>
      {(["overview", "mode", "recommendations", "quality"] as const).filter(key => item.itemType !== "temporary" || key !== "recommendations").map(key => <View key={key} style={styles.stack}><Text style={styles.subtitle}>{KNOWLEDGE_WORKSPACE_SECTION_LABELS[key]}</Text>
        {(expandedSummary === key ? summary[key].details : summary[key].preview).map(row => <View key={row.key} style={styles.summaryRow}><Text style={[styles.text, { flex: 1 }]}>{row.label}</Text><Text style={[styles.text, { flex: 1 }]}>{row.value}</Text></View>)}
        {!summary[key].preview.length ? <KnowledgeText>{key === "quality" && qualityQuery.isPending ? "Loading saved checklist…" : "No saved details available."}</KnowledgeText> : null}
        {summary[key].details.length > summary[key].preview.length ? <Button label={`${expandedSummary === key ? "Hide" : "Show"} ${KNOWLEDGE_WORKSPACE_SECTION_LABELS[key]} details`} variant="quiet" onPress={() => setExpandedSummary(expandedSummary === key ? null : key)} /> : null}
      </View>)}
    </KnowledgeDisclosure>
    <KnowledgeDisclosure title="Revision history" summary={revision ? `Revision ${revision.revisionNumber} · ${revision.status}` : "Saved versions"}>
      {revisions.length > 1 ? <KnowledgeSelect label="Revision" value={revisionId} disabled={locked} allowEmpty={false} options={revisions.map(value => ({ value: value.id, label: `Revision ${value.revisionNumber} · ${value.status}` }))} onChange={value => requestNavigation(() => setSelectedRevision(value))} /> : null}
      {historyQuery.isPending ? <KnowledgeText>Loading revision history…</KnowledgeText> : null}
      {revisions.map(value => <View key={value.id} style={styles.card}><KnowledgeText>Revision {value.revisionNumber} · {value.status}</KnowledgeText><KnowledgeText>Updated {formatKnowledgeDateTime(value.updatedAt)} · {value.completeness.percentage}% complete</KnowledgeText><Button label={`View revision ${value.revisionNumber}`} variant="quiet" disabled={locked || revisionId === value.id} onPress={() => requestNavigation(() => setSelectedRevision(value.id))} /></View>)}
      {!historyQuery.isPending && !historyQuery.isError && !revisions.length ? <KnowledgeText>No revision history is available.</KnowledgeText> : null}
    </KnowledgeDisclosure>
    {pendingNavigation ? <KnowledgeModal title="Unsaved Configuration changes" busy={locked} onClose={() => setPendingNavigation(null)}><KnowledgeText>Save your changes before leaving, or discard them.</KnowledgeText>{Object.entries(drafts).map(([key, draft]) => <KnowledgeText key={key}>{key === "advanced" ? "Mode" : key === "pricing" ? "Specifications" : key === "overview" ? "Overview" : "Recommendations"}: unsaved changes</KnowledgeText>)}{qualityDirty ? <KnowledgeText>Shared Main Basket Quality checklist changed.</KnowledgeText> : null}<Button label="Save and continue" loading={locked} onPress={() => void continueAfterSave()} /><Button label="Discard and continue" variant="danger" disabled={locked} onPress={() => { const next = pendingNavigation; discard(); setPendingNavigation(null); next(); }} /><Button label="Stay" variant="quiet" disabled={locked} onPress={() => setPendingNavigation(null)} />{error ? <KnowledgeText error>{error}</KnowledgeText> : null}</KnowledgeModal> : null}
    {conflict ? <KnowledgeCard title="Review newer configuration"><KnowledgeText>The saved section is now version {conflict.remote.version}. Review your changes and choose whether to keep them on the latest version.</KnowledgeText>{["Latest saved values", "Your retained values"].map((label, index) => {
      const payload = index === 0 ? conflict.remote.payload : drafts[conflict.key]?.payload ?? {};
      const projection = projectKnowledgeSavedSummary({ sections: { [conflict.key]: payload }, masters, baskets: basketQuery.data ?? [], items: relatedQuery.data ?? [], subBaskets: subBasketsQuery.data ?? [] });
      const group = conflict.key === "advanced" || conflict.key === "pricing" ? "mode" : conflict.key;
      return <KnowledgeCard key={label} title={label}>{projection[group].details.length ? projection[group].details.map(row => <KnowledgeText key={row.key}>{row.label}: {row.value}</KnowledgeText>) : <KnowledgeText>No configured values.</KnowledgeText>}</KnowledgeCard>;
    })}<Button label="Use my reviewed changes" variant="secondary" onPress={() => {
      const local = draftsRef.current[conflict.key];
      if (local) { const next = { ...draftsRef.current, [conflict.key]: rebaseKnowledgeDraft(local, conflict.remote) }; draftsRef.current = next; setDrafts(next); }
      aggregateBase.current = conflict.item.version; client.setQueryData(context.key("detail", mainLineId), conflict.item); client.setQueryData(context.key("section", mainLineId, revisionId, conflict.key), conflict.remote); setConflict(null); setError(""); setNotice("Reviewed changes retained. Save to apply them to the latest version.");
    }} /><Button label="Discard my changes and reload" variant="quiet" onPress={() => { discard(); void context.refresh(); }} /></KnowledgeCard> : null}
    {command ? <KnowledgeModal title={command === "rename" ? "Edit Main Line" : command === "revision" ? "Create Draft revision" : command === "duplicate" ? "Duplicate item" : command === "activate" ? "Review and activate" : command === "deactivate" ? "Deactivate item" : "Permanently delete item"} busy={busy} onClose={() => setCommand(null)}>
      {command === "duplicate" || command === "rename" ? <Field label="Main Line name" value={name} onChangeText={setName} editable={!busy} maxLength={240} /> : null}
      {command !== "rename" ? <Field label={command === "activate" ? "Reason (optional)" : "Reason"} value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={1000} /> : null}
      {command === "delete" ? <><KnowledgeText>This permanently deletes {item.mainLineName} and its supported Configuration records. Current estimates are not changed.</KnowledgeText><Field label="Confirm Main Line name" value={confirmation} onChangeText={setConfirmation} editable={!busy} /></> : null}
      {command === "activate" ? <><KnowledgeText>Activate Draft revision {item.draftRevision?.revisionNumber}. Active revisions remain immutable.</KnowledgeText>{item.warnings.map((finding, index) => <KnowledgeText key={index}>{finding.message}</KnowledgeText>)}</> : null}
      {error ? <KnowledgeText error>{error}</KnowledgeText> : null}<Button label={command === "delete" ? "Confirm permanent deletion" : "Confirm"} variant={command === "delete" ? "danger" : "primary"} loading={busy} disabled={commandConflict || (command === "activate" && item.blockers.length > 0)} onPress={() => void submitCommand()} />
    </KnowledgeModal> : null}
    </ScrollView>
    <View style={detail.footer}>
      <View style={{ flex: 1 }}><Text style={detail.footerText}>{dirty ? "Unsaved changes" : "Saved configuration"}</Text><Text style={detail.updated}>Updated {formatKnowledgeDateTime(item.updatedAt)}</Text></View>
      {dirty ? <IconButton label="Discard changes" icon="close" disabled={locked} onPress={() => setPendingNavigation(() => () => undefined)} /> : null}
      {canSave ? <Pressable accessibilityRole="button" accessibilityLabel={`Save ${KNOWLEDGE_WORKSPACE_SECTION_LABELS[active]}`} accessibilityState={{ disabled: !dirty || loading || Boolean(conflict) || locked, busy: locked }} disabled={!dirty || loading || Boolean(conflict) || locked} onPress={() => void save()} style={[detail.save, (!dirty || loading || Boolean(conflict) || locked) && { opacity: .5 }]}><Text style={detail.saveText}>{locked ? "Saving…" : "Save changes"}</Text></Pressable> : null}
    </View>
  </View>;
}

const MOBILE_TAB_LABELS: Record<KnowledgeWorkspaceSectionKey, string> = { overview: "Overview", mode: "Mode", recommendations: "Recommendations\n& Exclusions", quality: "Quality\nParameters" };
function friendlyFinding(message: string) {
  return message.replace(/\buomId\b/g, "Unit of measure").replace(/\bquantity-margin\b/g, "Quantity and margin").replace(/\boverview\b/g, "Overview").replace(/\brecommendations\b/g, "Recommendations").replace(/\badvanced\b/g, "Mode");
}
const detail = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1 },
  header: { gap: 4 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  backText: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 27, color: colors.ink },
  metadata: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  status: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 17, textTransform: "capitalize", color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  completeness: { gap: 4 },
  progressRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  completeLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkMuted },
  checksLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.primary },
  findings: { gap: 8, backgroundColor: colors.surfaceMuted, padding: 10, borderRadius: 4 },
  percent: { fontFamily: fonts.semibold, fontSize: 14, color: colors.primary },
  track: { flex: 1, minWidth: 24, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.primary },
  checksToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 2 },
  tabDock: { backgroundColor: colors.canvas, marginHorizontal: -12, paddingHorizontal: 12 },
  tabs: { flexDirection: "row", alignItems: "stretch", paddingBottom: 4 },
  tab: { minHeight: 48, justifyContent: "center", alignItems: "center", paddingVertical: 7, borderBottomWidth: 2, borderColor: "transparent" },
  activeTab: { borderColor: colors.primary },
  tabText: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 16, color: colors.inkMuted, textAlign: "center" },
  activeTabText: { color: colors.ink, fontFamily: fonts.semibold },
  footer: { flexDirection: "row", alignItems: "center", padding: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  footerText: { fontFamily: fonts.medium, fontSize: 11, color: colors.ink },
  updated: { fontFamily: fonts.regular, fontSize: 9, lineHeight: 14, color: colors.inkMuted },
  save: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 5, backgroundColor: colors.primary },
  saveText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryInk }
});
