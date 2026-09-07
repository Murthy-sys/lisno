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
import { KnowledgeSpecificationBuilder } from "./KnowledgeSpecificationBuilder";
import { parseKnowledgeSpecifications } from "./knowledgeSpecificationConfiguration";
import {
  KnowledgeModeConfigurationBuilder,
  type KnowledgeLegacyModeCatalogState
} from "./KnowledgeModeConfigurationBuilder";
import type { KnowledgeModeConfigurationIssue } from "./knowledgeModeConfiguration";
import { KnowledgeConflictReview } from "./KnowledgeConflictReview";
import { KnowledgeVersionConflictDialog } from "./KnowledgeVersionConflictDialog";
import type {
  KnowledgeBasket,
  KnowledgeItemDetail,
  KnowledgeItemListItem,
  KnowledgeJsonObject,
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

interface ModeDraft {
  readonly payload: KnowledgeJsonObject;
  readonly editedAdvancedFields: readonly ("modeConfigurations" | "modeDescription")[];
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
    legacyModeCatalogState,
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
  const [drafts, setDrafts] = useState(createEmptyModeDrafts);
  const [descriptionPending, setDescriptionPending] = useState(false);
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
    setDrafts(createEmptyModeDrafts());
    setConflict(null);
  }, [revisionId]);

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
  }, [advancedQuery.data, pricingQuery.data]);

  const dirty = descriptionPending || MODE_SECTION_KEYS.some((sectionKey) => drafts[sectionKey].dirty);
  const busy = advancedQuery.isFetching || pricingQuery.isFetching;

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
          editedAdvancedFields: sectionKey === "advanced"
            ? [...new Set([...current.advanced.editedAdvancedFields, ...(["modeConfigurations", "modeDescription"] as const).filter(
                (field) => JSON.stringify(current.advanced.payload[field]) !== JSON.stringify(payload[field])
              )])]
            : current[sectionKey].editedAdvancedFields
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
          setDrafts((current) => ({
            ...current,
            [sectionKey]: draftFromEnvelope(saved)
          }));
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
              ? sectionIssuesFromApiError(failure, sectionKey === "advanced" ? ["modeConfigurations", "modeDescription"] : ["specifications"])
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
  }, [descriptionPending, drafts, editable, mainLineId, onAnnouncement, queryClient, revisionId, saving]);

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

function emptyModeDraft(): ModeDraft {
  return {
    payload: {},
    editedAdvancedFields: [],
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
    editedAdvancedFields: [],
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
        : Object.fromEntries(draft.editedAdvancedFields.map((field) => [field, draft.payload[field] ?? (field === "modeConfigurations" ? [] : null)])))
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
  allowedRootPaths: readonly ("modeConfigurations" | "modeDescription" | "specifications")[]
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
