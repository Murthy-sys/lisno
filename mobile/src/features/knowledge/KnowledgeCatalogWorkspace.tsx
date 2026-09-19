import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { useInvalidateEvent } from "../../core/query/useInvalidation";
import { privateQueryKey } from "../../core/query/queryClient";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button, Field, StateView } from "../../ui/primitives";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  knowledgeActivateCommand,
  knowledgeCreateCommand,
  knowledgeDeactivateCommand,
  knowledgeDetailPath,
  knowledgeDuplicateCommand,
  knowledgeHistoryPath,
  knowledgeListPath,
  supportsKnowledgeAction,
  validateKnowledgeCreate,
  validateKnowledgeDuplicate,
  type KnowledgeBasket,
  type KnowledgeCreateDraft,
  type KnowledgeCreateInput,
  type KnowledgeDuplicateDraft,
  type KnowledgeItemDetail,
  type KnowledgeItemSummary,
  type KnowledgePage,
  type KnowledgeRevision
} from "./knowledgeCatalogModel";

const PAGE_SIZE = 20;
const CREATE_EMPTY: KnowledgeCreateDraft = {
  basketId: "",
  subBasketName: "",
  name: "",
  description: ""
};

type MutationCommand =
  | { readonly kind: "create"; readonly basketId: string; readonly input: KnowledgeCreateInput }
  | { readonly kind: "duplicate"; readonly item: KnowledgeItemDetail; readonly input: { readonly name: string; readonly reason?: string } }
  | { readonly kind: "activate"; readonly item: KnowledgeItemDetail }
  | { readonly kind: "deactivate"; readonly item: KnowledgeItemDetail; readonly reason: string };

type ItemCommand = "duplicate" | "activate" | "deactivate";

function requestError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === "VERSION_CONFLICT") {
      return "This knowledge item changed elsewhere. Refresh it before choosing another action.";
    }
    if (error.code === "KNOWLEDGE_ACTIVATION_BLOCKED") return error.message;
    if (error.status === 403) return "Your current access does not allow this action.";
  }
  return fallback;
}

function timestamp(value: string | null): string {
  if (!value) return "Not activated";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function KnowledgeStatus({ value }: { readonly value: string }) {
  return (
    <View accessibilityLabel={`Status ${statusLabel(value)}`} style={styles.status}>
      <Text style={styles.statusText}>{statusLabel(value)}</Text>
    </View>
  );
}

export interface KnowledgeCatalogWorkspaceProps {
  readonly session: AuthenticatedSession;
}

export function KnowledgeCatalogWorkspace({ session }: KnowledgeCatalogWorkspaceProps) {
  const context = useConfiguredRuntime();
  const invalidate = useInvalidateEvent();
  const permissions = session.authorization.permissions;
  const canRead = permissions.includes("ai_estimator_knowledge.configuration.read");
  const canCreate = permissions.includes("ai_estimator_knowledge.configuration.create");
  const canLifecycle = permissions.includes("ai_estimator_knowledge.configuration.lifecycle");
  const scope = useMemo(() => ({
    environmentId: context.environment.environment.id,
    userId: session.user.id
  }), [context.environment.environment.id, session.user.id]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedMainLineId, setSelectedMainLineId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<KnowledgeCreateDraft>(CREATE_EMPTY);
  const [itemCommand, setItemCommand] = useState<ItemCommand | null>(null);
  const [duplicateDraft, setDuplicateDraft] = useState<KnowledgeDuplicateDraft>({ name: "", reason: "" });
  const [deactivationReason, setDeactivationReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);

  const listPath = knowledgeListPath({ search: appliedSearch, limit: PAGE_SIZE, offset });
  const itemsQuery = useQuery({
    queryKey: privateQueryKey(scope, "knowledge", "catalog", appliedSearch, offset),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<KnowledgePage<KnowledgeItemSummary>>(listPath, { signal }),
    enabled: canRead && context.environment.status === "ready"
  });
  const basketsQuery = useQuery({
    queryKey: privateQueryKey(scope, "knowledge", "baskets"),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<KnowledgePage<KnowledgeBasket>>(
      "/admin/ai-estimator-knowledge/baskets?limit=100&offset=0",
      { signal }
    ),
    enabled: canRead && canCreate && context.environment.status === "ready"
  });
  const detailQuery = useQuery({
    queryKey: privateQueryKey(scope, "knowledge", "detail", selectedMainLineId),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<KnowledgeItemDetail>(
      knowledgeDetailPath(selectedMainLineId!),
      { signal }
    ),
    enabled: canRead && Boolean(selectedMainLineId) && context.environment.status === "ready"
  });
  const historyQuery = useQuery({
    queryKey: privateQueryKey(scope, "knowledge", "history", selectedMainLineId),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<KnowledgePage<KnowledgeRevision>>(
      knowledgeHistoryPath(selectedMainLineId!),
      { signal }
    ),
    enabled: canRead && Boolean(selectedMainLineId) && context.environment.status === "ready"
  });

  const activeBaskets = (basketsQuery.data?.items ?? []).filter((basket) => basket.status === "active");

  useEffect(() => {
    if (!createOpen || !activeBaskets.length) return;
    if (activeBaskets.some((basket) => basket.id === createDraft.basketId)) return;
    setCreateDraft((current) => ({ ...current, basketId: activeBaskets[0]?.id ?? "" }));
  }, [activeBaskets, createDraft.basketId, createOpen]);

  useEffect(() => {
    setItemCommand(null);
    setFormError(null);
    setNotice(null);
    setConflictVersion(null);
  }, [selectedMainLineId]);

  useEffect(() => {
    if (
      conflictVersion !== null &&
      detailQuery.data &&
      detailQuery.data.version !== conflictVersion
    ) {
      setConflictVersion(null);
      setFormError(null);
    }
  }, [conflictVersion, detailQuery.data]);

  const mutation = useMutation({
    mutationFn: async (command: MutationCommand) => {
      if (command.kind === "create") {
        const request = knowledgeCreateCommand(command.basketId, command.input);
        return context.runtime.api.authenticated.post<KnowledgeItemDetail>(request.path, request.body);
      }
      if (command.kind === "duplicate") {
        const request = knowledgeDuplicateCommand(command.item, command.input);
        return context.runtime.api.authenticated.post<KnowledgeItemDetail>(request.path, request.body);
      }
      if (command.kind === "activate") {
        const request = knowledgeActivateCommand(command.item);
        return context.runtime.api.authenticated.post<KnowledgeItemDetail>(request.path, request.body);
      }
      const request = knowledgeDeactivateCommand(command.item, command.reason);
      return context.runtime.api.authenticated.post<KnowledgeItemDetail>(request.path, request.body);
    },
    retry: false,
    onSuccess: async (result, command) => {
      setSelectedMainLineId(result.mainLineId);
      setItemCommand(null);
      setCreateOpen(false);
      setCreateDraft(CREATE_EMPTY);
      setDuplicateDraft({ name: "", reason: "" });
      setDeactivationReason("");
      setFormError(null);
      setConflictVersion(null);
      setNotice(
        command.kind === "create"
          ? "Knowledge item created as a Draft."
          : command.kind === "duplicate"
            ? "Knowledge item duplicated as a separate Draft."
            : command.kind === "activate"
              ? "Draft revision activated."
              : "Knowledge item deactivated."
      );
      await invalidate("knowledge-changed");
    },
    onError: async (cause, command) => {
      if (cause instanceof ApiError && cause.code === "VERSION_CONFLICT" && command.kind !== "create") {
        setConflictVersion(command.item.version);
        await invalidate("knowledge-changed");
      }
      setFormError(requestError(cause, "The knowledge action could not be completed. Try again."));
    }
  });

  const openItemCommand = (command: ItemCommand, item: KnowledgeItemDetail) => {
    setFormError(null);
    setNotice(null);
    setItemCommand(command);
    if (command === "duplicate") {
      setDuplicateDraft({ name: `${item.mainLineName} copy`, reason: "" });
    }
    if (command === "deactivate") setDeactivationReason("");
  };

  const submitCreate = () => {
    const result = validateKnowledgeCreate(createDraft, activeBaskets);
    setFormError(result.error ?? null);
    if (result.value) {
      mutation.mutate({ kind: "create", basketId: result.value.basketId, input: result.value.input });
    }
  };

  const submitItemCommand = (item: KnowledgeItemDetail) => {
    if (conflictVersion !== null || !itemCommand) return;
    setFormError(null);
    if (itemCommand === "activate") {
      mutation.mutate({ kind: "activate", item });
      return;
    }
    if (itemCommand === "deactivate") {
      try {
        knowledgeDeactivateCommand(item, deactivationReason);
        mutation.mutate({ kind: "deactivate", item, reason: deactivationReason });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Enter a valid deactivation reason.");
      }
      return;
    }
    const result = validateKnowledgeDuplicate(duplicateDraft);
    setFormError(result.error ?? null);
    if (result.value) mutation.mutate({ kind: "duplicate", item, input: result.value });
  };

  if (!canRead) {
    return (
      <StateView
        tone="denied"
        title="Knowledge catalog unavailable"
        message="Your current session does not include knowledge configuration access."
      />
    );
  }

  if (itemsQuery.isPending) {
    return <View style={styles.center}><BrandLoader label="Loading knowledge catalog" tone="dark" /></View>;
  }

  if (itemsQuery.isError) {
    return (
      <StateView
        tone="error"
        title="Knowledge catalog could not be loaded"
        message={requestError(itemsQuery.error, "Check your connection and try again.")}
        actionLabel="Retry"
        onAction={() => void itemsQuery.refetch()}
      />
    );
  }

  const page = itemsQuery.data;
  const detail = detailQuery.data;
  const commandBlocked = mutation.isPending || conflictVersion !== null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={(
        <RefreshControl
          refreshing={itemsQuery.isRefetching}
          tintColor={colors.violet}
          onRefresh={() => void itemsQuery.refetch()}
        />
      )}
    >
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>CONFIGURATION</Text>
        <Text accessibilityRole="header" style={styles.pageTitle}>AI Estimator Knowledge</Text>
        <Text style={styles.copy}>Review structured estimation rules and their revision lifecycle.</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Field
            label="Search knowledge"
            value={search}
            placeholder="Main Line or description"
            returnKeyType="search"
            onSubmitEditing={() => {
              setOffset(0);
              setAppliedSearch(search.trim());
            }}
            onChangeText={setSearch}
          />
        </View>
        <View style={styles.searchAction}>
          <Button
            label="Search"
            onPress={() => {
              setOffset(0);
              setAppliedSearch(search.trim());
            }}
          />
        </View>
      </View>

      {canCreate ? (
        createOpen ? (
          <View accessibilityLabel="Create knowledge item" style={styles.panel}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Add estimation item</Text>
            <Text style={styles.copy}>The new Main Line starts as a Draft in an active Main Basket.</Text>
            {basketsQuery.isPending ? <Text style={styles.copy}>Loading Main Baskets…</Text> : null}
            {basketsQuery.isError ? (
              <Button label="Retry Main Baskets" variant="secondary" onPress={() => void basketsQuery.refetch()} />
            ) : null}
            {!basketsQuery.isPending && !basketsQuery.isError && activeBaskets.length === 0 ? (
              <Text style={styles.warning}>Create or activate a Main Basket before adding an item.</Text>
            ) : null}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Main Basket</Text>
              <View accessibilityRole="radiogroup" style={styles.choices}>
                {activeBaskets.map((basket) => {
                  const selected = basket.id === createDraft.basketId;
                  return (
                    <Pressable
                      key={basket.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: mutation.isPending }}
                      disabled={mutation.isPending}
                      onPress={() => setCreateDraft((current) => ({ ...current, basketId: basket.id }))}
                      style={[styles.choice, selected ? styles.choiceSelected : null]}
                    >
                      <Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{basket.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Field label="Sub Basket" value={createDraft.subBasketName} editable={!mutation.isPending} onChangeText={(value) => setCreateDraft((current) => ({ ...current, subBasketName: value }))} />
            <Field label="Main Line name" value={createDraft.name} editable={!mutation.isPending} onChangeText={(value) => setCreateDraft((current) => ({ ...current, name: value }))} />
            <Field label="Description (optional)" value={createDraft.description} editable={!mutation.isPending} multiline onChangeText={(value) => setCreateDraft((current) => ({ ...current, description: value }))} />
            {formError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{formError}</Text> : null}
            <View style={styles.actions}>
              <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setCreateOpen(false); setFormError(null); }} /></View>
              <View style={styles.action}><Button label="Create Draft" loading={mutation.isPending} disabled={activeBaskets.length === 0} onPress={submitCreate} /></View>
            </View>
          </View>
        ) : (
          <Button label="Add estimation item" onPress={() => { setCreateOpen(true); setFormError(null); setNotice(null); }} />
        )
      ) : null}

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}

      {selectedMainLineId ? (
        <View style={styles.panel}>
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Item detail</Text>
            <Button label="Close detail" variant="quiet" disabled={mutation.isPending} onPress={() => setSelectedMainLineId(null)} />
          </View>
          {detailQuery.isPending ? <BrandLoader label="Loading item detail" tone="dark" /> : null}
          {detailQuery.isError ? (
            <StateView tone="error" title="Item detail could not be loaded" message={requestError(detailQuery.error, "Try loading this item again.")} actionLabel="Retry" onAction={() => void detailQuery.refetch()} />
          ) : null}
          {detail ? (
            <>
              <View style={styles.sectionHeading}>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{detail.mainLineName}</Text>
                  <Text style={styles.copy}>{detail.basketName}{detail.subBasketName ? ` · ${detail.subBasketName}` : ""}</Text>
                </View>
                <KnowledgeStatus value={detail.status} />
              </View>
              {detail.description ? <Text style={styles.copy}>{detail.description}</Text> : null}
              <Text style={styles.copy}>Completeness {detail.completeness.percentage}% · Server version {detail.version}</Text>
              {detail.blockers.length > 0 ? (
                <View style={styles.findings}>
                  <Text style={styles.warning}>Activation blockers</Text>
                  {detail.blockers.map((finding) => <Text key={`${finding.code}-${finding.sectionKey}`} style={styles.copy}>• {finding.message}</Text>)}
                </View>
              ) : null}
              {formError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{formError}</Text> : null}
              {itemCommand ? (
                <View style={styles.command}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>
                    {itemCommand === "duplicate" ? "Duplicate this item?" : itemCommand === "activate" ? "Activate this revision?" : "Deactivate this item?"}
                  </Text>
                  {itemCommand === "duplicate" ? (
                    <>
                      <Field label="Duplicate name" value={duplicateDraft.name} editable={!mutation.isPending} onChangeText={(value) => setDuplicateDraft((current) => ({ ...current, name: value }))} />
                      <Field label="Reason (optional)" value={duplicateDraft.reason} editable={!mutation.isPending} multiline onChangeText={(value) => setDuplicateDraft((current) => ({ ...current, reason: value }))} />
                    </>
                  ) : itemCommand === "deactivate" ? (
                    <Field label="Reason" value={deactivationReason} editable={!mutation.isPending} multiline onChangeText={setDeactivationReason} />
                  ) : (
                    <Text style={styles.copy}>The active revision will become available to the knowledge context service.</Text>
                  )}
                  <View style={styles.actions}>
                    <View style={styles.action}><Button label="Cancel" variant="quiet" disabled={mutation.isPending} onPress={() => { setItemCommand(null); setFormError(null); }} /></View>
                    <View style={styles.action}>
                      <Button
                        label={itemCommand === "duplicate" ? "Confirm duplicate" : itemCommand === "activate" ? "Confirm activation" : "Confirm deactivation"}
                        variant={itemCommand === "deactivate" ? "danger" : "primary"}
                        loading={mutation.isPending}
                        disabled={commandBlocked || (itemCommand === "activate" && detail.blockers.length > 0)}
                        onPress={() => submitItemCommand(detail)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.actions}>
                  {canCreate && supportsKnowledgeAction(detail, "duplicate") ? <View style={styles.action}><Button label="Duplicate" variant="secondary" disabled={commandBlocked} onPress={() => openItemCommand("duplicate", detail)} /></View> : null}
                  {canLifecycle && supportsKnowledgeAction(detail, "review_and_activate") ? <View style={styles.action}><Button label="Activate Draft" disabled={commandBlocked || detail.blockers.length > 0} onPress={() => openItemCommand("activate", detail)} /></View> : null}
                  {canLifecycle && supportsKnowledgeAction(detail, "deactivate") ? <View style={styles.action}><Button label="Deactivate" variant="danger" disabled={commandBlocked} onPress={() => openItemCommand("deactivate", detail)} /></View> : null}
                </View>
              )}
              <View style={styles.history}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Revision history</Text>
                {historyQuery.isPending ? <Text style={styles.copy}>Loading revision history…</Text> : null}
                {historyQuery.isError ? <Button label="Retry history" variant="secondary" onPress={() => void historyQuery.refetch()} /> : null}
                {historyQuery.data?.items.length === 0 ? <Text style={styles.copy}>No revisions are available.</Text> : null}
                {historyQuery.data?.items.map((revision) => (
                  <View key={revision.id} style={styles.historyRow}>
                    <View style={styles.flex}>
                      <Text style={styles.itemTitle}>Revision {revision.revisionNumber}</Text>
                      <Text style={styles.copy}>{revision.activatedAt ? `Activated ${timestamp(revision.activatedAt)}` : `Updated ${timestamp(revision.updatedAt)}`}</Text>
                    </View>
                    <KnowledgeStatus value={revision.status} />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {page.items.length === 0 ? (
        <StateView title="No knowledge items" message={appliedSearch ? "No items match this search." : "No estimation knowledge has been configured."} />
      ) : (
        <View style={styles.list}>
          {page.items.map((item) => (
            <Pressable
              key={item.mainLineId}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.mainLineName}`}
              onPress={() => setSelectedMainLineId(item.mainLineId)}
              style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
            >
              <View style={styles.sectionHeading}>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{item.mainLineName}</Text>
                  <Text style={styles.copy}>{item.basketName}{item.subBasketName ? ` · ${item.subBasketName}` : ""}</Text>
                </View>
                <KnowledgeStatus value={item.status} />
              </View>
              {item.description ? <Text numberOfLines={2} style={styles.copy}>{item.description}</Text> : null}
              <Text style={styles.meta}>Completeness {item.completeness.percentage}% · Revision {item.revisionNumber ?? "—"}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.pagination}>
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {page.pagination.total === 0 ? "0 items" : `Showing ${page.pagination.offset + 1}–${Math.min(page.pagination.offset + page.items.length, page.pagination.total)} of ${page.pagination.total}`}
        </Text>
        <View style={styles.actions}>
          <View style={styles.action}><Button label="Previous" variant="quiet" disabled={offset === 0} onPress={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))} /></View>
          <View style={styles.action}><Button label="Next" variant="secondary" disabled={!page.pagination.hasMore} onPress={() => setOffset((current) => current + PAGE_SIZE)} /></View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, width: "100%", maxWidth: 980, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4 },
  pageTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 },
  meta: { color: colors.info, fontFamily: fonts.medium, fontSize: 11 },
  searchRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  searchField: { flex: 1 },
  searchAction: { minWidth: 112 },
  panel: { gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.surface, backgroundColor: colors.surface, padding: spacing.md },
  command: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 },
  flex: { flex: 1, gap: spacing.xxs },
  fieldGroup: { gap: 6 },
  label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: { minHeight: 42, justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  choiceSelected: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
  choiceText: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12 },
  choiceTextSelected: { color: colors.violet },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  warning: { color: colors.warning, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  findings: { gap: spacing.xs, borderRadius: radii.control, backgroundColor: colors.warningSoft, padding: spacing.sm },
  status: { borderRadius: radii.pill, backgroundColor: colors.infoSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  statusText: { color: colors.info, fontFamily: fonts.semibold, fontSize: 11, textTransform: "capitalize" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, minWidth: 124 },
  list: { gap: spacing.sm },
  item: { gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.surface, backgroundColor: colors.surface, padding: spacing.md },
  pressed: { opacity: 0.74, borderColor: colors.violet },
  history: { gap: spacing.sm, paddingTop: spacing.sm },
  historyRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  itemTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  pagination: { gap: spacing.sm, alignItems: "center" }
});
