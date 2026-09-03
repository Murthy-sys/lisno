import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { ApiError } from "../../api/client";
import { Button } from "../../components/ui/Button";
import { Field, Input, Select } from "../../components/ui/Field";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import {
  getKnowledgeItem,
  getKnowledgeSection,
  previewKnowledge,
  updateKnowledgeSection,
  type KnowledgePreviewRequest
} from "./knowledgeApi";
import {
  commitKnowledgeSectionMutation,
  invalidateKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import {
  formatKnowledgeMoney,
  formatKnowledgePercentage,
  formatPaiseForRupeeInput,
  parseRupeeInputToPaise
} from "./knowledgePresentation";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import {
  knowledgeOverviewPayloadForUpdate,
  knowledgeSectionPayloadForUpdate,
  type KnowledgeOverviewEditableField
} from "./knowledgeSectionPayload";
import { KnowledgeSectionEditor } from "./KnowledgeSectionEditor";
import type { KnowledgeBudgetCatalogState } from "./KnowledgeBudgetBuilder";
import {
  KnowledgePriorityEditor,
  type KnowledgePriorityCatalogState
} from "./KnowledgePriorityEditor";
import type { KnowledgeUomCatalogState } from "./KnowledgeQuantitySlabBuilder";
import { validateKnowledgeSection } from "./knowledgeSectionValidation";
import { slabRateSpecificationIds } from "./knowledgeSlabRate";
import {
  KnowledgeModeConfigurationBuilder,
  type KnowledgeLegacyModeCatalogState
} from "./KnowledgeModeConfigurationBuilder";
import type { KnowledgeModeConfigurationIssue } from "./knowledgeModeConfiguration";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import {
  KnowledgeModeSurfacePanel,
  type KnowledgeSurfaceCatalogState
} from "./KnowledgeModeSurfacePanel";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import type {
  KnowledgeBasket,
  KnowledgeItemDetail,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgePreview,
  KnowledgeSectionApplicability,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";

const MODE_SECTION_KEYS = [
  "advanced",
  "pricing",
  "overview",
  "quantity-margin"
] as const satisfies readonly KnowledgeSectionKey[];

type ModeSectionKey = (typeof MODE_SECTION_KEYS)[number];

const MODE_SECTION_LABELS = {
  advanced: "Mode configuration",
  pricing: "Budgeting",
  overview: "Priority",
  "quantity-margin": "Quantity & margin"
} as const satisfies Readonly<Record<ModeSectionKey, string>>;

interface ModeDraft {
  readonly payload: KnowledgeJsonObject;
  readonly specificationReferenceIds: readonly string[];
  readonly applicability: KnowledgeSectionApplicability;
  readonly envelopeVersion: number | null;
  readonly valid: boolean;
  readonly dirty: boolean;
  readonly validationAttempt: number;
  readonly error: string | null;
  readonly serverIssues: readonly KnowledgeModeConfigurationIssue[];
  readonly serverReview: ModeServerReview | null;
  readonly editedFields: ReadonlySet<KnowledgeOverviewEditableField>;
}

interface ModeServerReview {
  readonly localVersion: number;
  readonly server: KnowledgeSectionEnvelope<KnowledgeJsonObject>;
}

interface ModeConflict {
  readonly sectionKey: ModeSectionKey;
  readonly localVersion: number;
  readonly server: KnowledgeSectionEnvelope<KnowledgeJsonObject>;
}

export interface KnowledgeModePanelHandle {
  readonly save: () => Promise<boolean>;
  readonly discard: () => void;
}

export interface KnowledgeModePanelProps {
  readonly item: KnowledgeItemDetail;
  readonly revisionId: string;
  readonly masters: Readonly<
    Partial<Record<KnowledgeMasterType, readonly KnowledgeMaster[]>>
  >;
  readonly relationshipBaskets: readonly KnowledgeBasket[];
  readonly relationshipItems: readonly KnowledgeItemListItem[];
  readonly editable: boolean;
  readonly canQuickAdd: boolean;
  readonly legacyModeCatalogState: KnowledgeLegacyModeCatalogState;
  readonly uomCatalogState?: KnowledgeUomCatalogState;
  readonly vendorCatalogState?: KnowledgeBudgetCatalogState;
  readonly priorityCatalogState?: KnowledgePriorityCatalogState;
  readonly surfaceCatalogState?: KnowledgeSurfaceCatalogState;
  readonly onQuickAdd: (
    type: KnowledgeMasterType,
    select: (master: KnowledgeMaster) => void
  ) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSavingChange: (saving: boolean) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSaveErrorChange?: (error: string | null) => void;
  readonly onAnnouncement: (message: string) => void;
}

export const KnowledgeModePanel = forwardRef<
  KnowledgeModePanelHandle,
  KnowledgeModePanelProps
>(function KnowledgeModePanel(
  {
    item,
    revisionId,
    masters,
    relationshipBaskets,
    relationshipItems,
    editable,
    canQuickAdd,
    legacyModeCatalogState,
    uomCatalogState = { status: "ready" },
    vendorCatalogState = { status: "ready" },
    priorityCatalogState = { status: "ready" },
    surfaceCatalogState = { status: "ready" },
    onQuickAdd,
    onDirtyChange,
    onSavingChange,
    onBusyChange,
    onSaveErrorChange = ignoreSaveError,
    onAnnouncement
  },
  ref
) {
  const queryClient = useQueryClient();
  const mainLineId = item.mainLineId;
  const advancedQuery = useModeSectionQuery(mainLineId, revisionId, "advanced");
  const pricingQuery = useModeSectionQuery(mainLineId, revisionId, "pricing");
  const overviewQuery = useModeSectionQuery(mainLineId, revisionId, "overview");
  const quantityQuery = useModeSectionQuery(
    mainLineId,
    revisionId,
    "quantity-margin"
  );
  const [drafts, setDrafts] = useState(createEmptyModeDrafts);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<ModeSectionKey | null>(null);
  const [conflict, setConflict] = useState<ModeConflict | null>(null);
  const aggregateBaselineRef = useRef({
    revisionId,
    version: item.version
  });
  if (aggregateBaselineRef.current.revisionId !== revisionId) {
    aggregateBaselineRef.current = { revisionId, version: item.version };
  }

  useEffect(() => {
    setDrafts(createEmptyModeDrafts());
    setConflict(null);
  }, [revisionId]);

  useEffect(() => {
    const envelopes = {
      advanced: advancedQuery.data,
      pricing: pricingQuery.data,
      overview: overviewQuery.data,
      "quantity-margin": quantityQuery.data
    };

    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const sectionKey of MODE_SECTION_KEYS) {
        const envelope = envelopes[sectionKey];
        const draft = current[sectionKey];
        if (
          !envelope ||
          draft.dirty ||
          (draft.envelopeVersion !== null &&
            envelope.version < draft.envelopeVersion)
        ) {
          continue;
        }
        next[sectionKey] = draftFromEnvelope(envelope);
        changed = true;
      }
      return changed ? next : current;
    });
  }, [advancedQuery.data, overviewQuery.data, pricingQuery.data, quantityQuery.data]);

  const dirty = MODE_SECTION_KEYS.some((sectionKey) => drafts[sectionKey].dirty);
  const busy = advancedQuery.isFetching
    || pricingQuery.isFetching
    || overviewQuery.isFetching
    || quantityQuery.isFetching
    || uomCatalogState.status === "loading"
    || Boolean(uomCatalogState.refreshing)
    || vendorCatalogState.status === "loading"
    || Boolean(vendorCatalogState.refreshing)
    || priorityCatalogState.status === "loading"
    || Boolean(priorityCatalogState.refreshing);
  const liveSlabSpecificationIds = useMemo(
    () => [...slabRateSpecificationIds(drafts["quantity-margin"].payload.slabRates)],
    [drafts]
  );

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onSavingChange(saving), [onSavingChange, saving]);
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  const saveError = MODE_SECTION_KEYS
    .map((sectionKey) => drafts[sectionKey].error)
    .find((error): error is string => Boolean(error)) ?? null;
  useEffect(() => onSaveErrorChange(saveError), [onSaveErrorChange, saveError]);
  useEffect(
    () => () => {
      onDirtyChange(false);
      onSavingChange(false);
      onBusyChange(false);
      onSaveErrorChange(null);
    },
    [onBusyChange, onDirtyChange, onSaveErrorChange, onSavingChange]
  );

  const setPayload = useCallback(
    (sectionKey: ModeSectionKey, payload: KnowledgeJsonObject) => {
      setDrafts((current) => ({
        ...current,
        [sectionKey]: { ...current[sectionKey], payload }
      }));
    },
    []
  );
  const markDirty = useCallback((sectionKey: ModeSectionKey) => {
    setDrafts((current) => ({
      ...current,
      [sectionKey]: {
        ...current[sectionKey],
        dirty: true,
        error: null,
        serverIssues: []
      }
    }));
  }, []);
  const setPriorityId = useCallback((priorityId: string) => {
    setDrafts((current) => {
      const payload = { ...current.overview.payload } as Record<string, KnowledgeJsonObject[string]>;
      if (priorityId) payload.priorityId = priorityId;
      else delete payload.priorityId;
      return {
        ...current,
        overview: {
          ...current.overview,
          payload,
          applicability: priorityId ? "configured" : current.overview.applicability,
          dirty: true,
          error: null,
          serverIssues: current.overview.serverIssues.filter(
            ({ path }) => path !== "priorityId" && !path.startsWith("priorityId.")
          ),
          editedFields: new Set(current.overview.editedFields).add("priorityId")
        }
      };
    });
  }, []);
  const setSurfaceIds = useCallback((surfaceIds: readonly string[]) => {
    setDrafts((current) => {
      const payload = { ...current.overview.payload } as Record<string, KnowledgeJsonObject[string]>;
      payload.surfaceIds = [...new Set(surfaceIds)];
      return {
        ...current,
        overview: {
          ...current.overview,
          payload,
          applicability: surfaceIds.length > 0 ? "configured" : current.overview.applicability,
          dirty: true,
          error: null,
          serverIssues: current.overview.serverIssues.filter(
            ({ path }) => path !== "surfaceIds" && !path.startsWith("surfaceIds.")
          ),
          editedFields: new Set(current.overview.editedFields).add("surfaceIds")
        }
      };
    });
  }, []);
  const markAdvancedConfigurationDirty = useCallback(() => {
    setDrafts((current) => ({
      ...current,
      advanced: {
        ...current.advanced,
        applicability: "configured",
        dirty: true,
        error: null,
        serverIssues: []
      }
    }));
  }, []);
  const setValid = useCallback((sectionKey: ModeSectionKey, valid: boolean) => {
    setDrafts((current) => {
      if (current[sectionKey].valid === valid) return current;
      return {
        ...current,
        [sectionKey]: { ...current[sectionKey], valid }
      };
    });
  }, []);
  const setPricingValid = useCallback(
    (valid: boolean) => setValid("pricing", valid),
    [setValid]
  );
  const setAdvancedValid = useCallback(
    (valid: boolean) => setValid("advanced", valid),
    [setValid]
  );
  const setQuantityValid = useCallback(
    (valid: boolean) => setValid("quantity-margin", valid),
    [setValid]
  );

  const discard = useCallback(() => {
    setDrafts({
      advanced: advancedQuery.data
        ? draftFromEnvelope(advancedQuery.data)
        : emptyModeDraft(),
      pricing: pricingQuery.data
        ? draftFromEnvelope(pricingQuery.data)
        : emptyModeDraft(),
      overview: overviewQuery.data
        ? draftFromEnvelope(overviewQuery.data)
        : emptyModeDraft(),
      "quantity-margin": quantityQuery.data
        ? draftFromEnvelope(quantityQuery.data)
        : emptyModeDraft()
    });
    setConflict(null);
  }, [advancedQuery.data, overviewQuery.data, pricingQuery.data, quantityQuery.data]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!editable || saving) return false;
    const snapshot = drafts;
    const dirtySections = MODE_SECTION_KEYS.filter(
      (sectionKey) => snapshot[sectionKey].dirty
    );
    if (!dirtySections.length) return true;

    const invalidSections = dirtySections.filter((sectionKey) => {
      const draft = snapshot[sectionKey];
      if (draft.envelopeVersion === null || !draft.valid) return true;
      if (sectionKey === "advanced") return false;
      return validateKnowledgeSection(
        sectionKey,
        draft.payload,
        sectionKey === "quantity-margin"
          ? {
              specifications: snapshot.pricing.payload.specifications,
              uoms: masters.uoms,
              uomCatalogStatus: uomCatalogState.status
            }
          : sectionKey === "pricing"
            ? {
                uoms: masters.uoms,
                vendors: masters.vendors,
                uomCatalogStatus: uomCatalogState.status,
                vendorCatalogStatus: vendorCatalogState.status
              }
            : {}
      ).length > 0;
    });
    if (invalidSections.length > 0) {
      setDrafts((current) => Object.fromEntries(
        MODE_SECTION_KEYS.map((sectionKey) => {
          if (!invalidSections.includes(sectionKey)) {
            return [sectionKey, current[sectionKey]];
          }
          const draft = snapshot[sectionKey];
          return [sectionKey, {
            ...current[sectionKey],
            validationAttempt: current[sectionKey].validationAttempt + 1,
            error: draft.envelopeVersion === null
              ? `${MODE_SECTION_LABELS[sectionKey]} is not loaded yet.`
              : `Review ${MODE_SECTION_LABELS[sectionKey]} before saving.`
          }];
        })
      ) as unknown as Record<ModeSectionKey, ModeDraft>);
      return false;
    }

    let expectedAggregateVersion = aggregateBaselineRef.current.version;
    let committedAnySection = false;
    setSaving(true);
    setConflict(null);
    setDrafts((current) =>
      Object.fromEntries(
        MODE_SECTION_KEYS.map((sectionKey) => [
          sectionKey,
          { ...current[sectionKey], error: null }
        ])
      ) as unknown as Record<ModeSectionKey, ModeDraft>
    );

    try {
      for (const sectionKey of dirtySections) {
        const draft = snapshot[sectionKey];
        const cachedOverview = sectionKey === "overview"
          ? queryClient.getQueryData<KnowledgeSectionEnvelope<KnowledgeJsonObject>>(
              knowledgeQueryKeys.section(mainLineId, revisionId, "overview")
            ) ?? overviewQuery.data
          : undefined;
        const latestOverview = cachedOverview
          && (draft.envelopeVersion === null || cachedOverview.version >= draft.envelopeVersion)
          ? cachedOverview
          : undefined;
        const envelopeVersion = latestOverview?.version ?? draft.envelopeVersion!;
        const applicability = sectionKey === "overview"
          && overviewHasConfiguration(draft.payload)
          ? "configured"
          : latestOverview?.applicability ?? draft.applicability;
        const payload = sectionKey === "overview"
          ? knowledgeOverviewPayloadForUpdate(
              latestOverview?.payload ?? draft.payload,
              draft.payload,
              draft.editedFields
            )
          : modeSectionPayloadForUpdate(sectionKey, draft.payload);
        setSavingSection(sectionKey);
        try {
          const saved = await updateKnowledgeSection(
            mainLineId,
            revisionId,
            sectionKey,
            {
              expectedVersion: envelopeVersion,
              expectedAggregateVersion,
              applicability,
              payload
            }
          );
          expectedAggregateVersion = saved.aggregateVersion;
          aggregateBaselineRef.current = {
            revisionId,
            version: saved.aggregateVersion
          };
          commitKnowledgeSectionMutation(queryClient, saved);
          setDrafts((current) => ({
            ...current,
            [sectionKey]: draftFromEnvelope(saved)
          }));
          if (sectionKey === "quantity-margin") {
            try {
              const latestPricing = await getKnowledgeSection<KnowledgeJsonObject>(
                mainLineId,
                revisionId,
                "pricing"
              );
              queryClient.setQueryData(
                knowledgeQueryKeys.section(mainLineId, revisionId, "pricing"),
                latestPricing
              );
              setDrafts((current) => ({
                ...current,
                pricing: {
                  ...current.pricing,
                  specificationReferenceIds: latestPricing.referenceState?.specificationIds ?? []
                }
              }));
            } catch {
              // The saved section remains authoritative; a later reload refreshes guidance.
            }
          }
          committedAnySection = true;
        } catch (failure) {
          if (
            failure instanceof ApiError &&
            failure.code === "VERSION_CONFLICT"
          ) {
            try {
              const [latestSection, latestItem] = await Promise.all([
                getKnowledgeSection<KnowledgeJsonObject>(
                  mainLineId,
                  revisionId,
                  sectionKey
                ),
                getKnowledgeItem(mainLineId)
              ]);
              queryClient.setQueryData(
                knowledgeQueryKeys.section(mainLineId, revisionId, sectionKey),
                latestSection
              );
              queryClient.setQueryData(
                knowledgeQueryKeys.item(mainLineId),
                latestItem
              );
              aggregateBaselineRef.current = {
                revisionId,
                version: latestItem.version
              };
              setConflict({
                sectionKey,
                localVersion: envelopeVersion,
                server: latestSection
              });
            } catch (refreshFailure) {
              const refreshMessage = refreshFailure instanceof Error
                ? refreshFailure.message
                : "The latest server version could not be loaded.";
              setDrafts((current) => ({
                ...current,
                [sectionKey]: {
                  ...current[sectionKey],
                  error: `A version conflict occurred, but the latest server version could not be loaded. ${refreshMessage}`
                }
              }));
            }
          } else {
            const message = sectionKey === "pricing"
              ? budgetFailureMessage(failure)
              : failure instanceof Error
                ? failure.message
                : "This block could not be saved.";
            const rawServerIssues = failure instanceof ApiError
              ? sectionIssuesFromApiError(
                  failure,
                  sectionKey === "advanced"
                    ? ["modeConfigurations"]
                    : sectionKey === "pricing"
                      ? ["specifications", "brands", "priceEntries"]
                      : sectionKey === "overview"
                        ? ["priorityId", "surfaceIds"]
                        : ["slabRates"]
                )
              : [];
            const serverIssues = sectionKey === "pricing"
              ? budgetServerIssues(
                  draft.payload,
                  rawServerIssues,
                  failure instanceof ApiError ? failure.code : null
                )
              : rawServerIssues;
            setDrafts((current) => ({
              ...current,
              [sectionKey]: {
                ...current[sectionKey],
                error: message,
                serverIssues,
                validationAttempt: sectionKey === "pricing"
                  && hasFocusableBudgetIssue(current[sectionKey].payload, serverIssues)
                  ? current[sectionKey].validationAttempt + 1
                  : current[sectionKey].validationAttempt
              }
            }));
          }
          return false;
        }
      }

      onAnnouncement("Mode saved.");
      return true;
    } finally {
      if (committedAnySection) {
        void invalidateKnowledgeSectionMutation(queryClient, mainLineId).catch(
          () => undefined
        );
      }
      setSavingSection(null);
      setSaving(false);
    }
  }, [drafts, editable, mainLineId, masters.uoms, masters.vendors, onAnnouncement, overviewQuery.data, queryClient, revisionId, saving, uomCatalogState.status, vendorCatalogState.status]);

  useImperativeHandle(ref, () => ({ save, discard }), [discard, save]);

  const renderBlock = (
    sectionKey: ModeSectionKey,
    query: UseQueryResult<KnowledgeSectionEnvelope<KnowledgeJsonObject>, Error>,
    editor: ReactNode
  ) => {
    const label = MODE_SECTION_LABELS[sectionKey];
    const draft = drafts[sectionKey];
    if (query.isPending && !query.data) {
      return <PageState key={sectionKey} state="loading" message={`Loading ${label}…`} />;
    }
    if (query.isError && !query.data) {
      return (
        <PageState
          key={sectionKey}
          state="error"
          message={`${label}: ${query.error.message}`}
          action={{ label: `Retry ${label}`, onAction: () => void query.refetch() }}
        />
      );
    }
    if (!query.data) {
      return (
        <PageState
          key={sectionKey}
          state="empty"
          message={`${label} is unavailable for this revision.`}
        />
      );
    }

    return (
      <Surface
        key={sectionKey}
        as="section"
        aria-label={label}
        className="knowledge-workspace-section knowledge-mode-block"
      >
        {sectionKey === "pricing" ? <h2 className="sr-only">{label}</h2> : null}
        <ModeBlockToolbar
          draft={draft}
          saving={savingSection === sectionKey}
        />
        {query.isError && query.data ? (
          <InlineMessage
            tone="warning"
            title={sectionKey === "pricing" ? "Showing saved budgets" : `Showing saved ${label}`}
            action={<Button size="compact" variant="secondary" onClick={() => void query.refetch()}>Retry</Button>}
          >
            {sectionKey === "pricing"
              ? "Latest updates could not be loaded."
              : "Latest updates could not be loaded; saved values remain visible."}
          </InlineMessage>
        ) : null}
        {draft.serverReview ? (
          <KnowledgeConflictReview
            sectionKey={sectionKey}
            localVersion={draft.serverReview.localVersion}
            serverVersion={draft.serverReview.server.version}
            payload={draft.serverReview.server.payload}
            masters={masters}
            relationshipBaskets={relationshipBaskets}
            relationshipItems={relationshipItems}
            specifications={drafts.pricing.payload.specifications}
          />
        ) : null}
        {editor}
        {draft.error ? (
          <InlineMessage tone="error" role="alert" title={`${label} could not be saved`}>
            {sectionKey === "pricing" ? draft.error : `${label}: ${draft.error}`}
          </InlineMessage>
        ) : null}
      </Surface>
    );
  };

  return (
    <div className="knowledge-mode-panel">
      {renderBlock(
        "advanced",
        advancedQuery,
        <KnowledgeModeConfigurationBuilder
          payload={drafts.advanced.payload}
          modes={masters.modes ?? []}
          legacyModeCatalogState={legacyModeCatalogState}
          serverIssues={drafts.advanced.serverIssues}
          readOnly={!editable || saving}
          validationAttempt={drafts.advanced.validationAttempt}
          onChange={(payload) => setPayload("advanced", payload)}
          onDirty={markAdvancedConfigurationDirty}
          onValidationChange={setAdvancedValid}
        />
      )}
      {renderBlock(
        "pricing",
        pricingQuery,
        <KnowledgeSectionEditor
          sectionKey="pricing"
          payload={drafts.pricing.payload}
          masters={masters}
          relationshipBaskets={relationshipBaskets}
          relationshipItems={relationshipItems}
          currentMainLineId={mainLineId}
          readOnly={!editable || saving}
          canQuickAdd={canQuickAdd && !saving}
          resetKey={`${revisionId}-pricing-${drafts.pricing.envelopeVersion ?? "pending"}`}
          specificationScopeKey={revisionId}
          specificationReferenceIds={drafts.pricing.specificationReferenceIds}
          slabSpecificationReferenceIds={liveSlabSpecificationIds}
          pricingAfterSpecifications={(
            <>
              {drafts.overview.serverReview && drafts.overview.editedFields.has("priorityId") ? (
                <KnowledgeConflictReview
                  sectionKey="overview"
                  localVersion={drafts.overview.serverReview.localVersion}
                  serverVersion={drafts.overview.serverReview.server.version}
                  payload={drafts.overview.serverReview.server.payload}
                  overviewFields={drafts.overview.editedFields.has("surfaceIds")
                    ? ["priorityId", "surfaceIds"]
                    : ["priorityId"]}
                  masters={masters}
                  relationshipBaskets={relationshipBaskets}
                  relationshipItems={relationshipItems}
                />
              ) : null}
              <KnowledgePriorityEditor
                priorityId={typeof drafts.overview.payload.priorityId === "string"
                  ? drafts.overview.payload.priorityId
                  : ""}
                priorities={masters.priorities ?? []}
                catalogState={priorityCatalogState}
                sectionState={{
                  status: overviewQuery.isError && !overviewQuery.data
                    ? "error"
                    : overviewQuery.isPending && !overviewQuery.data
                      ? "loading"
                      : "ready",
                  onRetry: () => { void overviewQuery.refetch(); }
                }}
                readOnly={!editable}
                saving={saving}
                dirty={drafts.overview.editedFields.has("priorityId")}
                error={drafts.overview.serverIssues.find(({ path }) => path === "priorityId")?.message}
                onChange={setPriorityId}
              />
              {drafts.overview.error
              && drafts.overview.editedFields.has("priorityId")
              && !drafts.overview.editedFields.has("surfaceIds")
              && drafts.overview.serverIssues.length === 0 ? (
                <InlineMessage tone="error" role="alert" title="Priority could not be saved">
                  Priority: {drafts.overview.error}
                </InlineMessage>
              ) : null}
            </>
          )}
          vendorCatalogState={vendorCatalogState}
          uomCatalogState={uomCatalogState}
          budgetReadOnly={!editable}
          budgetSaving={saving}
          onRetrySavedBudgetDetails={() => { void pricingQuery.refetch(); }}
          validationAttempt={drafts.pricing.validationAttempt}
          serverIssues={drafts.pricing.serverIssues}
          onChange={(payload) => setPayload("pricing", payload)}
          onDirty={() => markDirty("pricing")}
          onValidationChange={setPricingValid}
          onQuickAdd={onQuickAdd}
        />
      )}
      <Surface
        as="section"
        aria-label="Surfaces"
        className="knowledge-workspace-section knowledge-mode-block knowledge-mode-surface-block"
      >
        {overviewQuery.isError && overviewQuery.data ? (
          <InlineMessage
            tone="warning"
            title="Showing saved Surfaces"
            action={<Button size="compact" variant="secondary" onClick={() => void overviewQuery.refetch()}>Retry</Button>}
          >
            Latest updates could not be loaded; saved values remain visible.
          </InlineMessage>
        ) : null}
        {drafts.overview.serverReview
        && drafts.overview.editedFields.has("surfaceIds")
        && !drafts.overview.editedFields.has("priorityId") ? (
          <KnowledgeConflictReview
            sectionKey="overview"
            localVersion={drafts.overview.serverReview.localVersion}
            serverVersion={drafts.overview.serverReview.server.version}
            payload={drafts.overview.serverReview.server.payload}
            overviewFields={["surfaceIds"]}
            masters={masters}
            relationshipBaskets={relationshipBaskets}
            relationshipItems={relationshipItems}
          />
        ) : null}
        {drafts.overview.error
        && drafts.overview.editedFields.has("priorityId")
        && drafts.overview.editedFields.has("surfaceIds")
        && drafts.overview.serverIssues.length === 0 ? (
          <InlineMessage tone="error" role="alert" title="Priority and Surfaces could not be saved">
            Priority and Surfaces: {drafts.overview.error}
          </InlineMessage>
        ) : null}
        <KnowledgeModeSurfacePanel
          selectedIds={stringIds(drafts.overview.payload.surfaceIds)}
          surfaces={masters.surfaces ?? []}
          catalogState={surfaceCatalogState}
          sectionState={{
            status: overviewQuery.isError && !overviewQuery.data
              ? "error"
              : overviewQuery.isPending && !overviewQuery.data
                ? "loading"
                : "ready",
            onRetry: () => { void overviewQuery.refetch(); }
          }}
          readOnly={!editable}
          saving={saving}
          dirty={drafts.overview.editedFields.has("surfaceIds")}
          canQuickAdd={canQuickAdd && !saving}
          error={drafts.overview.serverIssues.find(({ path }) => path === "surfaceIds" || path.startsWith("surfaceIds."))?.message
            ?? (drafts.overview.error
              && drafts.overview.serverIssues.length === 0
              && drafts.overview.editedFields.has("surfaceIds")
              && !drafts.overview.editedFields.has("priorityId")
              ? drafts.overview.error
              : undefined)}
          onChange={setSurfaceIds}
          onQuickAdd={(select) => onQuickAdd("surfaces", (surface) => {
            select(surface);
            onAnnouncement(`${surface.name} added. Save Mode to apply it.`);
          })}
        />
      </Surface>
      {renderBlock(
        "quantity-margin",
        quantityQuery,
        <>
          <KnowledgeSectionEditor
            sectionKey="quantity-margin"
            payload={drafts["quantity-margin"].payload}
            masters={masters}
            relationshipBaskets={relationshipBaskets}
            relationshipItems={relationshipItems}
            currentMainLineId={mainLineId}
            readOnly={!editable || saving}
            canQuickAdd={canQuickAdd && !saving}
            resetKey={`${revisionId}-quantity-margin-${drafts["quantity-margin"].envelopeVersion ?? "pending"}`}
            pricingSpecifications={drafts.pricing.payload.specifications}
            uomCatalogState={uomCatalogState}
            validationAttempt={drafts["quantity-margin"].validationAttempt}
            onChange={(payload) => setPayload("quantity-margin", payload)}
            onDirty={() => markDirty("quantity-margin")}
            onValidationChange={setQuantityValid}
            onQuickAdd={onQuickAdd}
          />
          <KnowledgePreviewPanel disabled={saving} />
        </>
      )}

      {conflict ? (
        <KnowledgeVersionConflictDialog
          sectionLabel={conflict.sectionKey === "overview"
            ? overviewFieldLabel(drafts.overview.editedFields)
            : MODE_SECTION_LABELS[conflict.sectionKey]}
          localVersion={conflict.localVersion}
          serverVersion={conflict.server.version}
          onKeepEditing={() => {
            setDrafts((current) => ({
              ...current,
              [conflict.sectionKey]: rebaseDraftAfterConflict(
                current[conflict.sectionKey],
                conflict.server,
                null
              )
            }));
            setConflict(null);
          }}
          onReviewServerVersion={() => {
            setDrafts((current) => ({
              ...current,
              [conflict.sectionKey]: rebaseDraftAfterConflict(
                current[conflict.sectionKey],
                conflict.server,
                {
                  localVersion: conflict.localVersion,
                  server: conflict.server
                }
              )
            }));
            setConflict(null);
          }}
          onDiscardLocalChanges={() => {
            setDrafts((current) => ({
              ...current,
              [conflict.sectionKey]: draftFromEnvelope(conflict.server)
            }));
            setConflict(null);
          }}
        />
      ) : null}
    </div>
  );
});

function useModeSectionQuery(
  mainLineId: string,
  revisionId: string,
  sectionKey: ModeSectionKey
) {
  return useQuery({
    queryKey: knowledgeQueryKeys.section(mainLineId, revisionId, sectionKey),
    queryFn: () =>
      getKnowledgeSection<KnowledgeJsonObject>(
        mainLineId,
        revisionId,
        sectionKey
      ),
    enabled: Boolean(mainLineId && revisionId)
  });
}

function ignoreSaveError() {
  // Parent error reporting is optional for standalone Mode panel consumers.
}

function overviewHasConfiguration(payload: KnowledgeJsonObject) {
  return (typeof payload.priorityId === "string" && Boolean(payload.priorityId.trim()))
    || stringIds(payload.surfaceIds).length > 0;
}

function stringIds(value: KnowledgeJsonObject[string]): readonly string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string"))]
    : [];
}

function overviewFieldLabel(fields: ReadonlySet<KnowledgeOverviewEditableField>) {
  const priority = fields.has("priorityId");
  const surfaces = fields.has("surfaceIds");
  if (priority && surfaces) return "Priority and Surfaces";
  if (surfaces) return "Surfaces";
  return "Priority";
}

function emptyModeDraft(): ModeDraft {
  return {
    payload: {},
    specificationReferenceIds: [],
    applicability: "not_configured",
    envelopeVersion: null,
    valid: true,
    dirty: false,
    validationAttempt: 0,
    error: null,
    serverIssues: [],
    serverReview: null,
    editedFields: new Set()
  };
}

function createEmptyModeDrafts(): Record<ModeSectionKey, ModeDraft> {
  return {
    advanced: emptyModeDraft(),
    pricing: emptyModeDraft(),
    overview: emptyModeDraft(),
    "quantity-margin": emptyModeDraft()
  };
}

function draftFromEnvelope(
  envelope: KnowledgeSectionEnvelope<KnowledgeJsonObject>
): ModeDraft {
  return {
    payload: envelope.payload,
    specificationReferenceIds: envelope.referenceState?.specificationIds ?? [],
    applicability: envelope.applicability,
    envelopeVersion: envelope.version,
    valid: true,
    dirty: false,
    validationAttempt: 0,
    error: null,
    serverIssues: [],
    serverReview: null,
    editedFields: new Set()
  };
}

function rebaseDraftAfterConflict(
  draft: ModeDraft,
  server: KnowledgeSectionEnvelope<KnowledgeJsonObject>,
  serverReview: ModeServerReview | null
): ModeDraft {
  return {
    ...draft,
    specificationReferenceIds: server.referenceState?.specificationIds ?? [],
    applicability: server.applicability,
    envelopeVersion: server.version,
    error: null,
    serverReview
  };
}

function sectionIssuesFromApiError(
  failure: ApiError,
  allowedRootPaths: readonly ("modeConfigurations" | "specifications" | "brands" | "priceEntries" | "priorityId" | "surfaceIds" | "slabRates")[]
): readonly KnowledgeModeConfigurationIssue[] {
  if (allowedRootPaths.length === 0) return [];
  return Object.entries(failure.fields ?? {}).flatMap(([path, message]) => {
    const normalizedPath = path.startsWith("payload.")
      ? path.slice("payload.".length)
      : path;
    return allowedRootPaths.some((rootPath) =>
      normalizedPath === rootPath || normalizedPath.startsWith(`${rootPath}.`)
    )
      ? [{ path: normalizedPath, message }]
      : [];
  });
}

function businessBudgetIssue(
  issue: KnowledgeModeConfigurationIssue,
  errorCode: string | null
): KnowledgeModeConfigurationIssue {
  if (!issue.path.startsWith("priceEntries")) return issue;
  const rowPath = /^priceEntries\.\d+/u.exec(issue.path)?.[0] ?? "priceEntries";
  if (errorCode === "FIXED_GST_POLICY_UNAVAILABLE") {
    return { path: rowPath, message: FIXED_GST_POLICY_MESSAGE };
  }
  if (errorCode === "EFFECTIVE_WINDOW_OVERLAP") {
    return {
      path: `${rowPath}.effectiveFrom`,
      message: "Another budget for this unit already covers these dates."
    };
  }
  if (/\.(?:taxVersionId|treatment|taxRuleId)$/u.test(issue.path)
    || /tax|GST policy/iu.test(issue.message)) {
    return { path: rowPath, message: FIXED_GST_POLICY_MESSAGE };
  }
  if (/\.(?:sourcePriceVersionId|priceEntryId|priceVersionId|specificationId|modeId|status|versionNumber)$/u.test(issue.path)) {
    return {
      path: rowPath,
      message: "This saved budget can no longer be updated safely. Reload Budgeting and try again."
    };
  }
  if (issue.path.endsWith(".vendorId")) {
    return { path: `${rowPath}.vendorId`, message: "Choose an available Vendor." };
  }
  if (issue.path.endsWith(".uomId")) {
    return { path: `${rowPath}.uomId`, message: "Choose an available Unit of measure." };
  }
  if (issue.path.endsWith(".inputAmountPaise")) {
    return {
      path: `${rowPath}.inputAmountPaise`,
      message: "Enter a non-negative Unit budget before GST in rupees with up to two decimal places."
    };
  }
  if (issue.path.endsWith(".effectiveFrom")) {
    return { path: `${rowPath}.effectiveFrom`, message: "Enter a valid Starts on date and time." };
  }
  if (issue.path.endsWith(".effectiveTo")) {
    return { path: `${rowPath}.effectiveTo`, message: "Enter a valid Ends on date and time." };
  }
  return {
    path: rowPath,
    message: "Review this budget and try again."
  };
}

const FIXED_GST_POLICY_MESSAGE = "Budgeting is temporarily unavailable because GST could not be applied. Try again later.";

function budgetServerIssues(
  payload: KnowledgeJsonObject,
  issues: readonly KnowledgeModeConfigurationIssue[],
  errorCode: string | null
): readonly KnowledgeModeConfigurationIssue[] {
  const mapped = issues.map((issue) => businessBudgetIssue(issue, errorCode));
  if (errorCode !== "FIXED_GST_POLICY_UNAVAILABLE") return mapped;
  if (mapped.some(({ path }) => /^priceEntries\.\d+(?:\.|$)/u.test(path))) return mapped;
  const entries = Array.isArray(payload.priceEntries) ? payload.priceEntries : [];
  const index = entries.findIndex((entry) => isBudgetSetCommand(entry));
  return index < 0
    ? mapped
    : [...mapped, { path: `priceEntries.${index}`, message: FIXED_GST_POLICY_MESSAGE }];
}

function isBudgetSetCommand(value: unknown): boolean {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && "operation" in value
    && value.operation === "set_budget";
}

function hasFocusableBudgetIssue(
  payload: KnowledgeJsonObject,
  issues: readonly KnowledgeModeConfigurationIssue[]
): boolean {
  const rows = Array.isArray(payload.priceEntries) ? payload.priceEntries : [];
  return issues.some((issue) => {
    const match = /^priceEntries\.(\d+)(?:\.|$)/u.exec(issue.path);
    return match ? Number(match[1]) < rows.length : false;
  });
}

function budgetFailureMessage(failure: unknown): string {
  if (failure instanceof ApiError) {
    if (failure.status === 403) {
      return "You no longer have permission to update this Draft.";
    }
    if (failure.code === "VERSION_CONFLICT") return "Budgeting changed elsewhere.";
    if (failure.code === "EFFECTIVE_WINDOW_OVERLAP") {
      return "Another budget for this unit already covers these dates.";
    }
    if (failure.code === "FIXED_GST_POLICY_UNAVAILABLE" || failure.code === "KNOWLEDGE_TAX_WINDOW_MISMATCH") {
      return FIXED_GST_POLICY_MESSAGE;
    }
  }
  return "Review the highlighted budget and try again.";
}

function modeSectionPayloadForUpdate(
  sectionKey: ModeSectionKey,
  payload: KnowledgeJsonObject
): KnowledgeJsonObject {
  const prepared = knowledgeSectionPayloadForUpdate(sectionKey, payload);
  if (sectionKey !== "pricing" || !Array.isArray(prepared.priceEntries)) {
    return prepared;
  }

  return {
    ...prepared,
    priceEntries: prepared.priceEntries.map((entry) => {
      if (
        entry === null ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        entry.operation !== "append"
      ) {
        return entry;
      }
      return { ...entry, specificationId: null };
    })
  };
}

function ModeBlockToolbar({
  draft,
  saving
}: {
  readonly draft: ModeDraft;
  readonly saving: boolean;
}) {
  return (
    <div className="knowledge-section-toolbar knowledge-mode-block__toolbar">
      <span className="knowledge-section-toolbar__meta">
        Section version {draft.envelopeVersion ?? "Unavailable"}
      </span>
      {draft.dirty ? (
        <span className="knowledge-mode-block__dirty">
          {saving ? "Saving…" : "Unsaved changes"}
        </span>
      ) : null}
    </div>
  );
}

function KnowledgePreviewPanel({ disabled }: { readonly disabled: boolean }) {
  const [unitRateRupees, setUnitRateRupees] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityScale, setQuantityScale] = useState("0");
  const [quantityAdjustmentBps, setQuantityAdjustmentBps] = useState("");
  const [wastageBps, setWastageBps] = useState("");
  const [taxRateBps, setTaxRateBps] = useState("");
  const [taxTreatment, setTaxTreatment] = useState<"exclusive" | "inclusive">(
    "exclusive"
  );
  const [startMarginBps, setStartMarginBps] = useState("");
  const [bottomMarginBps, setBottomMarginBps] = useState("");
  const [pmcMarkupBps, setPmcMarkupBps] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<KnowledgePreview | null>(null);
  const parsedUnitRate = parseRupeeInputToPaise(unitRateRupees);
  const unitRateError =
    unitRateRupees === "" || parsedUnitRate.status === "valid"
      ? undefined
      : parsedUnitRate.status === "incomplete"
        ? "Complete the rupee amount with one or two digits after the decimal point."
        : parsedUnitRate.reason === "unsafe"
          ? "Enter a rupee amount within the supported range."
          : "Enter a non-negative rupee amount with no more than two decimal places.";
  const ready =
    parsedUnitRate.status === "valid" &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(quantity) &&
    isBoundedInteger(quantityScale, 0, 18);

  async function runPreview() {
    setPending(true);
    setError(null);
    try {
      setPreview(
        await previewKnowledge(
          previewRequest({
            unitRateRupees,
            quantity,
            quantityScale,
            quantityAdjustmentBps,
            wastageBps,
            taxRateBps,
            taxTreatment,
            startMarginBps,
            bottomMarginBps,
            pmcMarkupBps
          })
        )
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The preview could not be run."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface
      as="section"
      variant="subtle"
      className="knowledge-preview-panel"
      aria-labelledby="knowledge-preview-title"
    >
      <div className="knowledge-section-heading">
        <div>
          <h3 id="knowledge-preview-title">Server calculation preview</h3>
          <p>
            The server remains authoritative for monetary amounts, percentages,
            and canonical decimal quantities; the client does not calculate totals.
          </p>
        </div>
      </div>
      <div className="knowledge-form-grid">
        <Field
          id="preview-rate"
          label="Unit rate (₹)"
          hint="Enter a non-negative rupee amount with up to two decimal places, for example 0, 0.01, or 125.50."
          error={unitRateError}
        >
          {(props) => (
            <Input
              {...props}
              type="text"
              inputMode="decimal"
              value={unitRateRupees}
              onChange={(event) => setUnitRateRupees(event.target.value)}
              onBlur={() => {
                if (parsedUnitRate.status === "valid") {
                  setUnitRateRupees(
                    formatPaiseForRupeeInput(parsedUnitRate.paise)
                  );
                }
              }}
            />
          )}
        </Field>
        <PreviewInput id="preview-quantity" label="Quantity" value={quantity} setValue={setQuantity} text />
        <PreviewInput id="preview-scale" label="Quantity scale" value={quantityScale} setValue={setQuantityScale} />
        <PreviewInput id="preview-adjustment" label="Quantity adjustment (BPS)" value={quantityAdjustmentBps} setValue={setQuantityAdjustmentBps} />
        <PreviewInput id="preview-wastage" label="Wastage (BPS)" value={wastageBps} setValue={setWastageBps} />
        <PreviewInput id="preview-tax" label="Tax rate (BPS)" value={taxRateBps} setValue={setTaxRateBps} />
        {taxRateBps !== "" ? (
          <Field id="preview-treatment" label="Tax treatment">
            {(props) => (
              <Select
                {...props}
                value={taxTreatment}
                onChange={(event) =>
                  setTaxTreatment(event.target.value as typeof taxTreatment)
                }
              >
                <option value="exclusive">Exclusive</option>
                <option value="inclusive">Inclusive</option>
              </Select>
            )}
          </Field>
        ) : null}
        <PreviewInput id="preview-start-margin" label="Start margin (BPS)" value={startMarginBps} setValue={setStartMarginBps} />
        <PreviewInput id="preview-bottom-margin" label="Bottom margin (BPS)" value={bottomMarginBps} setValue={setBottomMarginBps} />
        <PreviewInput id="preview-pmc" label="PMC markup (BPS)" value={pmcMarkupBps} setValue={setPmcMarkupBps} />
      </div>
      <div className="knowledge-preview-actions">
        <Button
          variant="secondary"
          busy={pending}
          disabled={disabled || !ready}
          onClick={() => void runPreview()}
        >
          Run server preview
        </Button>
      </div>
      {error ? (
        <InlineMessage tone="error" role="alert">{error}</InlineMessage>
      ) : preview ? (
        <KnowledgePreviewResult preview={preview} />
      ) : null}
    </Surface>
  );
}

function PreviewInput({
  id,
  label,
  value,
  setValue,
  text = false
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly text?: boolean;
}) {
  return (
    <Field id={id} label={label}>
      {(props) => (
        <Input
          {...props}
          type={text ? "text" : "number"}
          min={text ? undefined : 0}
          step={text ? undefined : 1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )}
    </Field>
  );
}

function previewRequest(
  values: Readonly<{
    unitRateRupees: string;
    quantity: string;
    quantityScale: string;
    quantityAdjustmentBps: string;
    wastageBps: string;
    taxRateBps: string;
    taxTreatment: string;
    startMarginBps: string;
    bottomMarginBps: string;
    pmcMarkupBps: string;
  }>
): KnowledgePreviewRequest {
  const unitRate = parseRupeeInputToPaise(values.unitRateRupees);
  if (unitRate.status !== "valid") {
    throw new Error("Enter a valid unit rate in rupees before running the preview.");
  }
  const integer = (value: string) => (value === "" ? undefined : Number(value));
  const taxRateBps = integer(values.taxRateBps);
  return {
    unitRatePaise: unitRate.paise,
    quantity: values.quantity || null,
    quantityScale: Number(values.quantityScale),
    quantityAdjustmentBps: integer(values.quantityAdjustmentBps),
    wastageBps: integer(values.wastageBps),
    taxRateBps,
    ...(taxRateBps === undefined
      ? {}
      : { taxTreatment: values.taxTreatment as "exclusive" | "inclusive" }),
    startMarginBps: integer(values.startMarginBps),
    bottomMarginBps: integer(values.bottomMarginBps),
    pmcMarkupBps: integer(values.pmcMarkupBps)
  };
}

function isBoundedInteger(
  value: string,
  minimum: number,
  maximum: number
): boolean {
  return (
    value !== "" &&
    Number.isInteger(Number(value)) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function KnowledgePreviewResult({ preview }: { readonly preview: KnowledgePreview }) {
  const amounts = [
    ["Effective unit rate", preview.effectiveUnitRatePaise],
    ["Vendor pre-tax", preview.vendorPreTax?.amountPaise],
    ["Vendor tax", preview.vendorTax?.amountPaise],
    ["Vendor total", preview.vendorTotal?.amountPaise],
    ["Start margin", preview.startMargin?.amountPaise],
    ["Bottom margin", preview.bottomMargin?.amountPaise],
    ["PMC markup", preview.pmcMarkup?.amountPaise]
  ] as const;
  return (
    <div className="knowledge-preview-result" role="status">
      <h4>Preview components</h4>
      <dl>
        {amounts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{typeof value === "number" ? formatKnowledgeMoney(value) : "Not resolved"}</dd>
          </div>
        ))}
        <div>
          <dt>Procurement quantity</dt>
          <dd>{preview.procurementQuantity ?? "Not resolved"}</dd>
        </div>
        {preview.startMargin?.rateBps !== null &&
        preview.startMargin?.rateBps !== undefined ? (
          <div>
            <dt>Start margin rate</dt>
            <dd>{formatKnowledgePercentage(preview.startMargin.rateBps)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
