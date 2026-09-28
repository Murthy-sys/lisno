import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { KnowledgeReferenceListParams } from "../../../../shared/knowledge/knowledgeApi";
import type { KnowledgeMaster, KnowledgeMasterStatus } from "../../../../shared/knowledge/knowledgeTypes";
import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { Button, Field, StateView } from "../../ui/primitives";
import { colors, fonts, spacing } from "../../ui/tokens";
import { KnowledgeVendorEditor } from "../knowledge/KnowledgeVendorEditor";
import { allKnowledgePages } from "../knowledge/knowledgeRuntime";
import { KnowledgeCard, KnowledgeModal, KnowledgeSelect, KnowledgeText, knowledgeStyles as s } from "../knowledge/knowledgeUi";
import { catalogError } from "../knowledge/knowledgeCatalogForms";
import { useProcurementVendorContext, type VendorMobileContext } from "../knowledge/vendorRuntime";
import { vendorDisplayStatus } from "../knowledge/vendorDisplayStatus";
import { ProcurementSubnavigation } from "./ProcurementSubnavigation";
import { formatVendorKpiScore } from "./vendorKpiPresentation";

const PAGE_SIZE = 10;
const EMPTY_FILTERS = { search: "", status: "", vendorType: "", mainBasketId: "", subBasketId: "" } as const;
type Filters = { search: string; status: KnowledgeMasterStatus | ""; vendorType: "execution" | "supplier" | ""; mainBasketId: string; subBasketId: string };
const denied = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.status === 403);

export function ProcurementVendorsWorkspace({ session }: { readonly session: AuthenticatedSession }) {
  const context = useProcurementVendorContext(session);
  if (!context.canRead) return <StateView title="Vendors unavailable" message="Your current account cannot open the vendor directory." tone="denied" />;
  return <VendorDirectory key={context.scopeKey} session={session} context={context} />;
}

function VendorDirectory({ session, context }: { readonly session: AuthenticatedSession; readonly context: VendorMobileContext }) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<KnowledgeMaster | "new" | null>(null);
  const [archive, setArchive] = useState<KnowledgeMaster | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [notice, setNotice] = useState("");
  const params: KnowledgeReferenceListParams = {
    limit: PAGE_SIZE, offset,
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.vendorType ? { vendorType: filters.vendorType } : {}),
    ...(filters.mainBasketId ? { mainBasketId: filters.mainBasketId } : {}),
    ...(filters.subBasketId ? { subBasketId: filters.subBasketId } : {}),
    ...(filters.status === "archived" ? { includeArchived: true } : {})
  };
  const vendors = useQuery({ queryKey: context.key("vendor-directory", params), queryFn: () => context.api.listKnowledgeMasters("vendors", params), enabled: context.ready && context.canRead, retry: false });
  const overview = useQuery({ queryKey: context.key("vendor-directory-overview"), queryFn: () => context.api.listKnowledgeMasters("vendors", { includeDirectoryOverview: true, limit: 1, offset: 0 }), enabled: context.ready && context.canRead, retry: false });
  const baskets = useQuery({ queryKey: context.key("baskets", "vendor-directory-filters"), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeBaskets({ ...page, includeArchived: true })), enabled: context.ready && context.canRead, retry: false });
  const subBaskets = useQuery({ queryKey: context.key("sub-baskets", "vendor-directory-filters", filters.mainBasketId), queryFn: () => allKnowledgePages(page => context.api.listKnowledgeSubBaskets(filters.mainBasketId, page)), enabled: context.ready && context.canRead && Boolean(filters.mainBasketId), retry: false });
  const archiveMutation = useMutation({ mutationFn: async (target: KnowledgeMaster) => {
    if (!context.ready || !context.canRead || !context.canLifecycle) throw new Error("Vendor archive permission is required.");
    return context.api.archiveKnowledgeMaster("vendors", target.id, { expectedVersion: target.version, reason: archiveReason.trim() });
  }, retry: false, onSuccess: async saved => {
    setArchive(null); setArchiveReason(""); setNotice(`${saved.name} archived.`);
    const refreshes = await Promise.allSettled([context.refresh(), vendors.refetch(), overview.refetch()]);
    if (refreshes.some(result => result.status === "rejected")) setNotice(`${saved.name} archived. Some vendor views could not refresh; pull to refresh.`);
  } });
  useEffect(() => {
    if (vendors.isSuccess && !vendors.isFetching && offset > 0 && offset >= vendors.data.pagination.total) {
      setOffset(Math.max(0, Math.floor((vendors.data.pagination.total - 1) / PAGE_SIZE) * PAGE_SIZE));
    }
  }, [vendors.isSuccess, vendors.isFetching, vendors.data, offset]);
  const accessLost = denied(vendors.error) || denied(overview.error) || denied(baskets.error) || denied(subBaskets.error) || denied(archiveMutation.error);
  if (accessLost) return <StateView title="Vendors unavailable" message="Your current session cannot access the vendor directory." tone="denied" />;
  const applySearch = () => { setFilters(current => ({ ...current, search: search.trim() })); setOffset(0); };
  const changeFilters = (next: Partial<Filters>) => { setFilters(current => ({ ...current, ...next })); setOffset(0); };
  const resetFilters = () => { setSearch(""); setFilters(EMPTY_FILTERS); setOffset(0); };
  const refresh = () => { void context.refresh(); void vendors.refetch(); void overview.refetch(); void baskets.refetch(); if (filters.mainBasketId) void subBaskets.refetch(); };
  const count = overview.data?.directoryOverview;
  const filtering = Boolean(Object.values(filters).some(Boolean));
  return <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={vendors.isRefetching || overview.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>PROCUREMENT</Text>
      <Text accessibilityRole="header" style={styles.title}>Vendors</Text>
      <Text style={styles.description}>Manage shared vendor records and classifications.</Text>
    </View>
    <ProcurementSubnavigation session={session} active="vendors" />
    <View style={styles.metrics}>
      {([ ["Total vendors", count?.totalVendors], ["Active", count?.activeVendors], ["Under review", count?.underReviewVendors] ] as const).map(([label, value]) => <View key={label} style={styles.metric}>
        <Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value === undefined ? "—" : value.toLocaleString("en-IN")}</Text>
      </View>)}
      <View style={styles.metric}><Text style={styles.metricLabel}>Average Vendor KPI</Text><Text style={styles.metricValue}>{formatVendorKpiScore(count?.averageKpiScoreBps)}</Text></View>
    </View>
    {overview.isPending ? <KnowledgeText>Loading vendor overview…</KnowledgeText> : null}
    {overview.isError ? <StateView title="Vendor overview unavailable" message={catalogError(overview.error)} actionLabel="Retry overview" onAction={() => void overview.refetch()} tone="error" /> : null}
    {overview.isSuccess && !count ? <StateView title="Vendor overview unavailable" message="The vendor totals were not returned. Refresh to try again." actionLabel="Retry overview" onAction={() => void overview.refetch()} tone="error" /> : null}
    <View style={styles.sectionHeading}><View style={styles.sectionCopy}><Text accessibilityRole="header" style={styles.sectionTitle}>Configured vendors</Text><Text style={styles.description}>Active vendors are available for procurement work.</Text></View>{context.canCreate ? <Button label="Add vendor" size="compact" onPress={() => setEditor("new")} /> : null}</View>
    <View style={styles.filters}>
      <Field label="Search vendors" value={search} onChangeText={setSearch} onSubmitEditing={applySearch} returnKeyType="search" maxLength={100} placeholder="Vendor name or code" />
      <Button label="Search" variant="secondary" size="compact" onPress={applySearch} />
      <KnowledgeSelect label="Status" value={filters.status} placeholder="All current" options={(["active", "inactive", "archived"] as const).map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))} onChange={value => changeFilters({ status: value as Filters["status"] })} />
      <KnowledgeSelect label="Vendor Type" value={filters.vendorType} placeholder="All types" options={[{ value: "execution", label: "Execution" }, { value: "supplier", label: "Supplier" }]} onChange={value => changeFilters({ vendorType: value as Filters["vendorType"] })} />
      <KnowledgeSelect label="Main Basket" value={filters.mainBasketId} placeholder="All Main Baskets" options={(baskets.data ?? []).map(value => ({ value: value.id, label: value.name }))} disabled={!baskets.isSuccess} onChange={value => changeFilters({ mainBasketId: value, subBasketId: "" })} />
      <KnowledgeSelect label="Sub Basket" value={filters.subBasketId} placeholder="All Sub Baskets" options={(subBaskets.data ?? []).filter(value => value.basketId === filters.mainBasketId).map(value => ({ value: value.id, label: value.name }))} disabled={!filters.mainBasketId || !subBaskets.isSuccess} onChange={value => changeFilters({ subBasketId: value })} />
      {filtering ? <Button label="Reset filters" variant="quiet" size="compact" onPress={resetFilters} /> : null}
      {baskets.isError || (filters.mainBasketId && subBaskets.isError) ? <StateView title="Classification filters unavailable" message="Basket choices could not be loaded." actionLabel="Retry basket choices" onAction={() => { void baskets.refetch(); if (filters.mainBasketId) void subBaskets.refetch(); }} tone="error" /> : null}
    </View>
    {notice ? <KnowledgeText>{notice}</KnowledgeText> : null}
    {vendors.isPending ? <KnowledgeText>Loading vendors…</KnowledgeText> : vendors.isError ? <StateView title="Vendors could not be loaded" message={catalogError(vendors.error)} actionLabel="Retry vendors" onAction={() => void vendors.refetch()} tone="error" /> : !vendors.data.items.length ? <StateView title={filtering ? "No matching vendors" : "No vendors configured"} message={filtering ? "Adjust the filters or reset your search." : "Add a vendor to get started."} /> : <View style={styles.list}>{vendors.data.items.map(vendor => <KnowledgeCard key={vendor.id}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open ${vendor.name} KPI`} onPress={() => router.push({ pathname: "/vendor/[vendorId]", params: { vendorId: vendor.id, from: "procurement-vendors" } })}><Text style={s.title}>{vendor.name}</Text></Pressable>
      <KnowledgeText>{vendorDisplayStatus(vendor)}{vendor.procurementSummary?.vendorType ? ` · ${vendor.procurementSummary.vendorType}` : ""}</KnowledgeText>
      {vendor.procurementSummary?.mainBaskets?.length ? <KnowledgeText>Main Baskets: {vendor.procurementSummary.mainBaskets.map(value => value.name ?? "Unavailable").join(", ")}</KnowledgeText> : null}
      <KnowledgeText>Vendor KPI: {formatVendorKpiScore(vendor.vendorKpi?.officialScoreBps)} · {vendor.vendorKpi?.selfStatus === "submitted" ? "Self submitted" : vendor.vendorKpi?.selfStatus === "not_submitted" ? "Self not submitted" : "Self status unavailable"}</KnowledgeText>
      <View style={s.row}><Button label={`${context.canUpdate && vendor.status !== "archived" ? "Edit" : "View profile for"} ${vendor.name}`} variant="secondary" size="compact" onPress={() => setEditor(vendor)} />{context.canLifecycle && vendor.status !== "archived" ? <Button label={`Archive ${vendor.name}`} variant="danger" size="compact" onPress={() => { setArchive(vendor); setArchiveReason(""); archiveMutation.reset(); }} /> : null}</View>
    </KnowledgeCard>)}</View>}
    {vendors.isRefetching ? <KnowledgeText>Updating vendors…</KnowledgeText> : null}
    {vendors.data && !vendors.isError ? <View style={styles.pagination}><KnowledgeText>{vendors.data.pagination.total ? `Showing ${offset + 1}–${offset + vendors.data.items.length} of ${vendors.data.pagination.total}` : "No vendors"}</KnowledgeText><View style={s.row}><Button label="Previous vendor page" variant="secondary" size="compact" disabled={offset === 0 || vendors.isFetching} onPress={() => setOffset(current => Math.max(0, current - PAGE_SIZE))} /><Button label="Next vendor page" variant="secondary" size="compact" disabled={!vendors.data.pagination.hasMore || vendors.isFetching} onPress={() => setOffset(current => current + PAGE_SIZE)} /></View></View> : null}
    {editor && (editor === "new" ? context.canCreate : context.canRead) ? <KnowledgeVendorEditor context={context} {...(editor === "new" ? {} : { existing: editor })} onClose={() => setEditor(null)} onSaved={saved => { setEditor(null); setNotice(`${saved.name} saved.`); }} /> : null}
    {archive && context.canLifecycle ? <KnowledgeModal title={`Archive ${archive.name}`} busy={archiveMutation.isPending} onClose={() => setArchive(null)}>
      <KnowledgeText>This vendor will be unavailable for new selections. Existing project references remain.</KnowledgeText>
      <Field label="Reason for archiving" value={archiveReason} onChangeText={setArchiveReason} editable={!archiveMutation.isPending && !archiveMutation.isError} multiline maxLength={1000} />
      {archiveMutation.isError ? <KnowledgeText error>{catalogError(archiveMutation.error)} Close and refresh the directory before trying again.</KnowledgeText> : null}
      <Button label="Archive vendor" variant="danger" disabled={!context.ready || !archiveReason.trim() || archiveMutation.isPending || archiveMutation.isError} loading={archiveMutation.isPending} onPress={() => archiveMutation.mutate(archive)} />
    </KnowledgeModal> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg, backgroundColor: colors.canvas },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 27 },
  description: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  metric: { flexGrow: 1, flexBasis: "30%", minWidth: 96, padding: spacing.sm, gap: spacing.xs, borderRightWidth: 1, borderColor: colors.border },
  metricLabel: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 11 },
  metricValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 22 },
  sectionHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  sectionCopy: { flex: 1, minWidth: 180, gap: spacing.xs },
  sectionTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  filters: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  list: { gap: spacing.sm },
  pagination: { gap: spacing.sm, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.md }
});
