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
import { InlineMessage } from "../../components/ui/InlineMessage";
import { PageState } from "../../components/ui/PageState";
import { Surface } from "../../components/ui/Surface";
import {
  getKnowledgeItem,
  getKnowledgeSection,
  updateKnowledgeSection
} from "./knowledgeApi";
import {
  commitKnowledgeSectionMutation,
  invalidateKnowledgeSectionMutation
} from "./knowledgeMutationSync";
import { knowledgeQueryKeys } from "./knowledgeQueryKeys";
import { knowledgeSectionPayloadForUpdate } from "./knowledgeSectionPayload";
import { pendingValuesEqual, type KnowledgePendingChangesCallback } from "./knowledgePendingChanges";
import { projectKnowledgeModePendingChanges, type KnowledgePendingCalculation } from "./knowledgeModePendingChanges";
import { KnowledgeSpecificationBuilder } from "./KnowledgeSpecificationBuilder";
import { parseKnowledgeSpecifications } from "./knowledgeSpecificationConfiguration";
import {
  KnowledgeModeConfigurationBuilder,
  type KnowledgeLegacyModeCatalogState
} from "./KnowledgeModeConfigurationBuilder";
import type { KnowledgeModeConfigurationIssue } from "./knowledgeModeConfiguration";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import { KnowledgeModeCalculationEditor, type KnowledgeModeCalculationUom } from "./KnowledgeModeCalculationEditor";
import { KnowledgeInHouseTotal } from "./KnowledgeInHouseTotal";
import { MODE_CALCULATION_LABELS, MODE_CALCULATION_SCOPES, modeCalculationsForPayload, modeCalculationsForStorage, withModeCalculation, type ModeCalculationScope } from "./knowledgeModeCalculation";
import type { KnowledgeBudgetCatalogState } from "./KnowledgeBudgetBuilder";
import type {
  KnowledgeBasket,
  KnowledgeItemDetail,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
  KnowledgeJsonValue,
  KnowledgeMaster,
  KnowledgeMasterType,
  KnowledgeSectionApplicability,
  KnowledgeSectionEnvelope,
  KnowledgeSectionKey
} from "./knowledgeTypes";

const MODE_SECTION_KEYS = [
  "advanced",
  "pricing"
] as const satisfies readonly KnowledgeSectionKey[];

type ModeSectionKey = (typeof MODE_SECTION_KEYS)[number];

const MODE_SECTION_LABELS = {
  advanced: "Mode configuration",
  pricing: "Specifications"
} as const satisfies Readonly<Record<ModeSectionKey, string>>;

const PENDING_DESCRIPTION_MESSAGE = "Save or cancel the paragraph before saving Mode.";
const ADVANCED_EDITABLE_FIELDS = ["modeConfigurations", "modeDescription", "modeCalculation", "pmcMarginBps", "subVendorMarginBps"] as const;
type AdvancedEditableField = (typeof ADVANCED_EDITABLE_FIELDS)[number];

interface ModeDraft {
  readonly payload: KnowledgeJsonObject;
  readonly pendingBaseline: KnowledgeJsonObject | null;
  readonly pendingPayload: KnowledgeJsonObject;
  readonly editedAdvancedFields: readonly AdvancedEditableField[];
  readonly editedCalculationScopes: readonly ModeCalculationScope[];
  readonly specificationReferenceIds: readonly string[];
  readonly applicability: KnowledgeSectionApplicability;
  readonly envelopeVersion: number | null;
  readonly valid: boolean;
  readonly dirty: boolean;
  readonly validationAttempt: number;
  readonly error: string | null;
  readonly serverIssues: readonly KnowledgeModeConfigurationIssue[];
  readonly serverReview: ModeServerReview | null;
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
  readonly legacyModeCatalogState: KnowledgeLegacyModeCatalogState;
  readonly uomCatalogState?: KnowledgeBudgetCatalogState;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSavingChange: (saving: boolean) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSaveErrorChange?: (error: string | null) => void;
  readonly onAnnouncement: (message: string) => void;
  readonly pendingChangesSourceKey?: string;
  readonly onPendingChanges?: KnowledgePendingChangesCallback;
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
    legacyModeCatalogState,
    uomCatalogState = { status: "ready" },
    onDirtyChange,
    onSavingChange,
    onBusyChange,
    onSaveErrorChange = ignoreSaveError,
    onAnnouncement,
    pendingChangesSourceKey,
    onPendingChanges
  },
  ref
) {
  const queryClient = useQueryClient();
  const mainLineId = item.mainLineId;
  const sourceKey = pendingChangesSourceKey ?? `${mainLineId}:${revisionId}:mode`;
  const [draftSourceKey, setDraftSourceKey] = useState(sourceKey);
  const currentSource = useRef(sourceKey);
  currentSource.current = sourceKey;
  const advancedQuery = useModeSectionQuery(mainLineId, revisionId, "advanced");
  const pricingQuery = useModeSectionQuery(mainLineId, revisionId, "pricing");
  const overviewQuery = useModeSectionQuery(mainLineId, revisionId, "overview");
  const [drafts, setDrafts] = useState(createEmptyModeDrafts);
  const [calculationValidity, setCalculationValidity] = useState<Record<ModeCalculationScope, boolean>>({ pmc: true, sub_vendor: true, in_house_labor: true, in_house_material: true });
  const setCalculationValid = useCallback((scope: ModeCalculationScope, valid: boolean) => {
    setCalculationValidity((current) => current[scope] === valid ? current : { ...current, [scope]: valid });
  }, []);
  const [descriptionPending, setDescriptionPending] = useState(false);
  const [pendingCalculationSaveVersion, setPendingCalculationSaveVersion] = useState(0);
  const [pendingDescription, setPendingDescription] = useState<string | null>(null);
  const [pendingCalculations, setPendingCalculations] = useState<Partial<Record<ModeCalculationScope, KnowledgePendingCalculation | null>>>({});
  const publishDescription = useCallback((text: string | null) => {
    if (currentSource.current === sourceKey) setPendingDescription(text);
  }, [sourceKey]);
  const calculationPublishers = useMemo(() => Object.fromEntries(MODE_CALCULATION_SCOPES.map((scope) => [scope, (pending: KnowledgePendingCalculation | null) => {
    if (currentSource.current !== sourceKey) return;
    setPendingCalculations((current) => pendingValuesEqual(current[scope] ?? null, pending) ? current : { ...current, [scope]: pending });
  }])) as Record<ModeCalculationScope, (pending: KnowledgePendingCalculation | null) => void>, [sourceKey]);
  const [descriptionResetVersion, setDescriptionResetVersion] = useState(0);
  useEffect(() => {
    if (!descriptionPending) setDrafts((current) => current.advanced.error === PENDING_DESCRIPTION_MESSAGE
      ? { ...current, advanced: { ...current.advanced, error: null } }
      : current);
  }, [descriptionPending]);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<ModeSectionKey | null>(null);
  const [conflict, setConflict] = useState<ModeConflict | null>(null);
  const specificationsRef = useRef<HTMLDivElement>(null);
  const specificationIssues = [
    ...parseKnowledgeSpecifications(drafts.pricing.payload.specifications).issues,
    ...drafts.pricing.serverIssues
  ];
  useEffect(() => {
    if (drafts.pricing.validationAttempt > 0 && !saving) {
      specificationsRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [drafts.pricing.validationAttempt, saving]);
  const aggregateBaselineRef = useRef({
    revisionId,
    version: item.version
  });
  if (aggregateBaselineRef.current.revisionId !== revisionId) {
    aggregateBaselineRef.current = { revisionId, version: item.version };
  }

  useEffect(() => {
    setDraftSourceKey(sourceKey);
    setDrafts(createEmptyModeDrafts());
    setPendingDescription(null);
    setPendingCalculations({});
    setDescriptionPending(false);
    setDescriptionResetVersion((current) => current + 1);
    setConflict(null);
  }, [sourceKey]);

  useEffect(() => {
    const envelopes = {
      advanced: advancedQuery.data,
      pricing: pricingQuery.data
    };

    setDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const sectionKey of MODE_SECTION_KEYS) {
        const envelope = envelopes[sectionKey];
        const draft = current[sectionKey];
        if (
          !envelope ||
          draft.dirty || (sectionKey === "advanced" && descriptionPending) ||
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
  }, [advancedQuery.data, pricingQuery.data, descriptionPending, sourceKey]);

  const dirty = descriptionPending || MODE_SECTION_KEYS.some((sectionKey) => drafts[sectionKey].dirty);
  const busy = advancedQuery.isFetching || pricingQuery.isFetching || overviewQuery.isFetching;
  const savedUomId = overviewQuery.data?.payload.uomId;
  const savedUom = (masters.uoms ?? []).find((uom) => uom.id === savedUomId);
  const uomScopeKey = `${mainLineId}:${revisionId}`;
  const calculationUom: KnowledgeModeCalculationUom = overviewQuery.isError
    ? { scopeKey: uomScopeKey, label: "Unavailable", message: "Could not load the UOM saved in Overview.", onRetry: () => void overviewQuery.refetch() }
    : !overviewQuery.data || uomCatalogState.status === "loading"
      ? { scopeKey: uomScopeKey, label: "Loading…", message: "Loading the saved Overview UOM." }
      : uomCatalogState.status === "error"
        ? { scopeKey: uomScopeKey, label: "Unavailable", message: "Could not load the UOM details.", onRetry: uomCatalogState.onRetry }
        : !savedUomId
          ? { scopeKey: uomScopeKey, label: "Not set", message: "Save a UOM in Overview to test these calculations." }
          : !savedUom || savedUom.decimalScale === undefined
            ? { scopeKey: uomScopeKey, label: savedUom?.name ?? "Unavailable", message: "The saved UOM details are unavailable. Review the UOM in Overview.", onRetry: uomCatalogState.onRetry }
            : { scopeKey: uomScopeKey, id: savedUom.id, label: savedUom.name, decimalScale: savedUom.decimalScale };

  const pendingGroups = useMemo(() => editable && draftSourceKey === sourceKey ? projectKnowledgeModePendingChanges({
    advancedBaseline: drafts.advanced.pendingBaseline,
    advancedDraft: drafts.advanced.pendingPayload,
    pricingBaseline: drafts.pricing.pendingBaseline,
    pricingDraft: drafts.pricing.pendingPayload,
    mainLineName: item.mainLineName, modes: masters.modes,
    pendingDescription, pendingCalculations, uomLabel: calculationUom.label
  }) : [], [editable, draftSourceKey, sourceKey, drafts, item.mainLineName, masters.modes, pendingDescription, pendingCalculations, calculationUom.label]);
  useEffect(() => { onPendingChanges?.({ sourceKey, groups: pendingGroups }); }, [onPendingChanges, sourceKey, pendingGroups]);
  useEffect(() => () => { onPendingChanges?.({ sourceKey, groups: [] }); }, [onPendingChanges, sourceKey]);

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
        [sectionKey]: {
          ...current[sectionKey],
          payload,
          ...pendingModeStateAfterEdit(current[sectionKey], payload, sectionKey),
          editedAdvancedFields: sectionKey === "advanced"
            ? [...new Set([...current.advanced.editedAdvancedFields, ...ADVANCED_EDITABLE_FIELDS.filter(
                (field) => JSON.stringify(current.advanced.payload[field]) !== JSON.stringify(payload[field])
              )])]
            : current[sectionKey].editedAdvancedFields,
          editedCalculationScopes: sectionKey === "advanced"
            ? [...new Set([...current.advanced.editedCalculationScopes, ...MODE_CALCULATION_SCOPES.filter(
                (scope) => JSON.stringify(modeCalculationsForPayload(current.advanced.payload)[scope]) !== JSON.stringify(modeCalculationsForPayload(payload)[scope])
              )])]
            : current[sectionKey].editedCalculationScopes
        }
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
  const setAdvancedValid = useCallback(
    (valid: boolean) => setValid("advanced", valid),
    [setValid]
  );
  const discard = useCallback(() => {
    setDescriptionPending(false);
    setPendingDescription(null);
    setPendingCalculations({});
    setDescriptionResetVersion((current) => current + 1);
    setDrafts({
      advanced: advancedQuery.data
        ? draftFromEnvelope(advancedQuery.data)
        : emptyModeDraft(),
      pricing: pricingQuery.data
        ? draftFromEnvelope(pricingQuery.data)
        : emptyModeDraft()
    });
    setConflict(null);
  }, [advancedQuery.data, pricingQuery.data]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!editable || saving) return false;
    if (descriptionPending) {
      setDrafts((current) => ({ ...current, advanced: {
        ...current.advanced,
        validationAttempt: current.advanced.validationAttempt + 1,
        error: PENDING_DESCRIPTION_MESSAGE
      } }));
      return false;
    }
    const snapshot = drafts;
    const dirtySections = MODE_SECTION_KEYS.filter(
      (sectionKey) => snapshot[sectionKey].dirty
    );
    if (!dirtySections.length) return true;

    const invalidSections = dirtySections.filter((sectionKey) => {
      const draft = snapshot[sectionKey];
      if (draft.envelopeVersion === null || !draft.valid) return true;
      if (sectionKey === "advanced") return false;
      return parseKnowledgeSpecifications(draft.payload.specifications).issues.length > 0;
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
        const envelopeVersion = draft.envelopeVersion!;
        const applicability = draft.applicability;
        const payload = knowledgeSectionPayloadForUpdate(sectionKey, draft.payload);
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
          if (currentSource.current === sourceKey) {
            setDrafts((current) => ({
              ...current,
              [sectionKey]: draftFromEnvelope(saved)
            }));
            if (sectionKey === "advanced") { setPendingCalculations({}); setPendingDescription(null); setPendingCalculationSaveVersion((version) => version + 1); }
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
            const message = failure instanceof Error ? failure.message : "This block could not be saved.";
            const serverIssues = failure instanceof ApiError
              ? sectionIssuesFromApiError(failure, sectionKey === "advanced" ? [...ADVANCED_EDITABLE_FIELDS, "modeCalculations"] : ["specifications"])
              : [];
            setDrafts((current) => ({
              ...current,
              [sectionKey]: {
                ...current[sectionKey],
                error: message,
                serverIssues,
                validationAttempt: current[sectionKey].validationAttempt + 1
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
  }, [descriptionPending, drafts, editable, mainLineId, onAnnouncement, queryClient, revisionId, saving, sourceKey]);

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
        aria-label={sectionKey === "pricing" ? "Specifications configuration" : label}
        className="knowledge-workspace-section knowledge-mode-block"
      >
        <ModeBlockToolbar
          draft={draft}
          saving={savingSection === sectionKey}
        />
        {query.isError && query.data ? (
          <InlineMessage
            tone="warning"
            title={`Showing saved ${label}`}
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
            sectionLabel={label}
            localVersion={draft.serverReview.localVersion}
            serverVersion={draft.serverReview.server.version}
            payload={sectionKey === "pricing"
              ? { specifications: draft.serverReview.server.payload.specifications ?? [] }
              : draft.serverReview.server.payload}
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
          mainLineName={item.mainLineName}
          descriptionResetKey={`${revisionId}-${descriptionResetVersion}`}
          onPendingDescriptionChange={setDescriptionPending}
          onPendingDescriptionTextChange={publishDescription}
          modes={masters.modes ?? []}
          legacyModeCatalogState={legacyModeCatalogState}
          serverIssues={drafts.advanced.serverIssues}
          readOnly={!editable || saving}
          validationAttempt={drafts.advanced.validationAttempt}
          onChange={(payload) => setPayload("advanced", payload)}
          onDirty={markAdvancedConfigurationDirty}
          onValidationChange={setAdvancedValid}
          calculationValidity={calculationValidity}
          inHouseTotal={(active) => <KnowledgeInHouseTotal key={`${uomScopeKey}-${descriptionResetVersion}-total`}
            active={active} uom={calculationUom}
            labor={modeCalculationsForPayload(drafts.advanced.payload).in_house_labor}
            material={modeCalculationsForPayload(drafts.advanced.payload).in_house_material}
            valid={calculationValidity.in_house_labor && calculationValidity.in_house_material}
          />}
          calculation={(scope, active, marginControl) => <KnowledgeModeCalculationEditor
            key={`${uomScopeKey}-${descriptionResetVersion}-${scope}`}
            active={active}
            scope={scope}
            pmcMarginBps={scope === "pmc" ? drafts.advanced.payload.pmcMarginBps : undefined}
            subVendorMarginBps={scope === "sub_vendor" ? drafts.advanced.payload.subVendorMarginBps : undefined}
            marginControl={marginControl}
            contextLabel={MODE_CALCULATION_LABELS[scope]}
            issuePath={`modeCalculations.${scope}`}
            value={modeCalculationsForPayload(drafts.advanced.payload)[scope]}
            uom={{ ...calculationUom, scopeKey: `${calculationUom.scopeKey}:${scope}` }}
            readOnly={!editable || saving}
            validationAttempt={drafts.advanced.validationAttempt}
            issues={drafts.advanced.serverIssues}
            onChange={(modeCalculation) => setPayload("advanced", withModeCalculation(drafts.advanced.payload, scope, modeCalculation))}
            onDirty={markAdvancedConfigurationDirty}
            onValidationChange={(valid) => setCalculationValid(scope, valid)}
            onPendingInputChange={calculationPublishers[scope]}
            pendingSaveVersion={pendingCalculationSaveVersion}
          />}
        />
      )}
      {renderBlock(
        "pricing",
        pricingQuery,
        <div ref={specificationsRef}>
          <KnowledgeSpecificationBuilder
            value={drafts.pricing.payload.specifications}
            priceEntries={drafts.pricing.payload.priceEntries}
            referencedSpecificationIds={drafts.pricing.specificationReferenceIds}
            readOnly={!editable || saving}
            issues={specificationIssues}
            onChange={(specifications) => setPayload("pricing", {
              ...drafts.pricing.payload,
              specifications: [...specifications]
            })}
            onDirty={() => markDirty("pricing")}
          />
          {drafts.pricing.validationAttempt > 0 && specificationIssues.length > 0 ? (
            <InlineMessage tone="error" role="alert" title="Review Specifications">
              <ul>
                {specificationIssues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            </InlineMessage>
          ) : null}
        </div>
      )}

      {conflict ? (
        <KnowledgeVersionConflictDialog
          sectionLabel={MODE_SECTION_LABELS[conflict.sectionKey]}
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
            if (conflict.sectionKey === "advanced") {
              setPendingCalculations({});
              setPendingDescription(null);
              setDescriptionPending(false);
              // A matching server value will not trigger the input's value effect.
              // Remount the discarded advanced inputs to accept its new baseline.
              setDescriptionResetVersion((version) => version + 1);
            }
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
  sectionKey: ModeSectionKey | "overview"
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

function emptyModeDraft(): ModeDraft {
  return {
    payload: {},
    pendingBaseline: null,
    pendingPayload: {},
    editedAdvancedFields: [],
    editedCalculationScopes: [],
    specificationReferenceIds: [],
    applicability: "not_configured",
    envelopeVersion: null,
    valid: true,
    dirty: false,
    validationAttempt: 0,
    error: null,
    serverIssues: [],
    serverReview: null
  };
}

function createEmptyModeDrafts(): Record<ModeSectionKey, ModeDraft> {
  return {
    advanced: emptyModeDraft(),
    pricing: emptyModeDraft()
  };
}

function draftFromEnvelope(
  envelope: KnowledgeSectionEnvelope<KnowledgeJsonObject>
): ModeDraft {
  return {
    payload: envelope.payload,
    pendingBaseline: envelope.payload,
    pendingPayload: envelope.payload,
    editedAdvancedFields: [],
    editedCalculationScopes: [],
    specificationReferenceIds: envelope.referenceState?.specificationIds ?? [],
    applicability: envelope.applicability,
    envelopeVersion: envelope.version,
    valid: true,
    dirty: false,
    validationAttempt: 0,
    error: null,
    serverIssues: [],
    serverReview: null
  };
}

function rebaseDraftAfterConflict(
  draft: ModeDraft,
  server: KnowledgeSectionEnvelope<KnowledgeJsonObject>,
  serverReview: ModeServerReview | null
): ModeDraft {
  return {
    ...draft,
    payload: {
      ...server.payload,
      ...(server.sectionKey === "pricing"
        ? { specifications: draft.payload.specifications ?? [] }
        : {
            ...Object.fromEntries(draft.editedAdvancedFields.map((field) => [field, draft.payload[field] ?? (field === "modeConfigurations" ? [] : null)])),
            ...(draft.editedCalculationScopes.length ? { modeCalculations: {
              ...modeCalculationsForStorage(server.payload),
              ...Object.fromEntries(draft.editedCalculationScopes.map((scope) => [scope, modeCalculationsForPayload(draft.payload)[scope]]))
            } } : {})
          })
    },
    specificationReferenceIds: server.referenceState?.specificationIds ?? [],
    applicability: server.sectionKey === "advanced" ? draft.applicability : server.applicability,
    envelopeVersion: server.version,
    error: null,
    serverReview
  };
}

function sectionIssuesFromApiError(
  failure: ApiError,
  allowedRootPaths: readonly (AdvancedEditableField | "modeCalculations" | "specifications")[]
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

/** Apply only the latest local edit, excluding values incorporated by conflict rebase. */
function pendingModeStateAfterEdit(draft: ModeDraft, after: KnowledgeJsonObject, sectionKey: ModeSectionKey): Pick<ModeDraft, "pendingBaseline" | "pendingPayload"> {
  const baseline = { ...(draft.pendingBaseline ?? {}) };
  const next = { ...draft.pendingPayload };
  const before = draft.payload;
  const apply = (localBaseline: KnowledgeJsonValue | undefined, local: KnowledgeJsonValue | undefined, saved: KnowledgeJsonValue | undefined, edited: KnowledgeJsonValue | undefined) => {
    const acceptedBaseline = pendingBaselineForNewEdit(localBaseline, local, saved, edited);
    const acceptedDraft = applyPendingEdit(local, localBaseline, acceptedBaseline);
    return { baseline: acceptedBaseline, payload: applyPendingEdit(acceptedDraft, saved, edited) };
  };
  const fields = sectionKey === "pricing" ? ["specifications"] : ADVANCED_EDITABLE_FIELDS;
  for (const field of fields) {
    if (pendingValuesEqual(before[field], after[field])) continue;
    const updated = apply(baseline[field], next[field], before[field], after[field]);
    baseline[field] = updated.baseline ?? null;
    next[field] = updated.payload ?? null;
  }
  if (sectionKey === "advanced") {
    const oldCalculations = modeCalculationsForPayload(before);
    const calculations = modeCalculationsForPayload(after);
    const changed = MODE_CALCULATION_SCOPES.filter((scope) => !pendingValuesEqual(oldCalculations[scope], calculations[scope]));
    if (changed.length) {
      const baselineCalculations = { ...modeCalculationsForStorage(baseline) };
      const localCalculations = { ...modeCalculationsForStorage(next) };
      for (const scope of changed) {
        const updated = apply(modeCalculationsForPayload(baseline)[scope], modeCalculationsForPayload(next)[scope], oldCalculations[scope], calculations[scope]);
        baselineCalculations[scope] = updated.baseline ?? null;
        localCalculations[scope] = updated.payload ?? null;
      }
      baseline.modeCalculations = baselineCalculations;
      next.modeCalculations = localCalculations;
    }
  }
  return { pendingBaseline: baseline, pendingPayload: next };
}
const pendingObject = (value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value));
/** Conflict recovery can expose a saved row/field that this session has not edited.
 * Capture its accepted pre-edit value only when the user first changes it. Existing
 * local differences retain their original comparison values. */
function pendingBaselineForNewEdit(baseline: KnowledgeJsonValue | undefined, local: KnowledgeJsonValue | undefined, before: KnowledgeJsonValue | undefined, after: KnowledgeJsonValue | undefined): KnowledgeJsonValue | undefined {
  if (pendingValuesEqual(before, after)) return baseline;
  if (pendingObject(before) && pendingObject(after) && pendingObject(baseline) && pendingObject(local)) {
    const result = { ...baseline };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const value = pendingBaselineForNewEdit(baseline[key], local[key], before[key], after[key]);
      if (value === undefined) delete result[key]; else result[key] = value;
    }
    return result;
  }
  if (Array.isArray(before) && Array.isArray(after) && Array.isArray(baseline) && Array.isArray(local)
    && [...before, ...after, ...baseline, ...local].every((row) => pendingObject(row) && typeof row.id === "string")) {
    const result = [...baseline] as KnowledgeJsonObject[];
    for (const row of before as KnowledgeJsonObject[]) {
      if (!(after as KnowledgeJsonObject[]).some((candidate) => candidate.id === row.id)
        && !result.some((candidate) => candidate.id === row.id)
        && !(local as KnowledgeJsonObject[]).some((candidate) => candidate.id === row.id)) result.push(row);
    }
    for (const row of after as KnowledgeJsonObject[]) {
      const previous = (before as KnowledgeJsonObject[]).find((candidate) => candidate.id === row.id);
      if (!previous || pendingValuesEqual(previous, row)) continue;
      const index = result.findIndex((candidate) => candidate.id === row.id);
      const current = (local as KnowledgeJsonObject[]).find((candidate) => candidate.id === row.id);
      const value = pendingBaselineForNewEdit(index < 0 ? undefined : result[index], current, previous, row) as KnowledgeJsonObject;
      if (index < 0) result.push(value); else result[index] = value;
    }
    return result;
  }
  return pendingValuesEqual(baseline, local) ? before : baseline;
}
function applyPendingEdit(local: KnowledgeJsonValue | undefined, before: KnowledgeJsonValue | undefined, after: KnowledgeJsonValue | undefined): KnowledgeJsonValue | undefined {
  if (pendingValuesEqual(before, after)) return local;
  const object = (value: KnowledgeJsonValue | undefined): value is KnowledgeJsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (object(before) && object(after)) {
    const next = { ...(object(local) ? local : before) };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!pendingValuesEqual(before[key], after[key])) {
        const value = applyPendingEdit(next[key], before[key], after[key]);
        if (value === undefined) delete next[key]; else next[key] = value;
      }
    }
    return next;
  }
  if (Array.isArray(before) && Array.isArray(after) && before.every((row) => object(row) && typeof row.id === "string") && after.every((row) => object(row) && typeof row.id === "string")) {
    const oldRows = before as KnowledgeJsonObject[];
    const rows = after as KnowledgeJsonObject[];
    const localRows = Array.isArray(local) ? local.filter(object) : oldRows;
    const removed = new Set(oldRows.filter((row) => !rows.some((candidate) => candidate.id === row.id)).map((row) => row.id));
    const result = localRows.filter((row) => !removed.has(row.id));
    for (const row of rows) {
      const previous = oldRows.find((candidate) => candidate.id === row.id);
      if (pendingValuesEqual(previous, row)) continue;
      const index = result.findIndex((candidate) => candidate.id === row.id);
      const updated = applyPendingEdit(index < 0 ? previous : result[index], previous, row) as KnowledgeJsonObject;
      if (index < 0) result.push(updated); else result[index] = updated;
    }
    const retained = rows.filter((row) => oldRows.some((previous) => previous.id === row.id));
    const reordered = retained.some((row, index) => index > 0 && oldRows.findIndex((previous) => previous.id === row.id) < oldRows.findIndex((previous) => previous.id === retained[index - 1]!.id));
    if (reordered) result.sort((a, b) => rows.findIndex((row) => row.id === a.id) - rows.findIndex((row) => row.id === b.id));
    return result;
  }
  return after;
}
