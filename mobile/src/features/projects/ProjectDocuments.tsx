import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError, ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import { canPerformOperation } from "../../core/session/operationCapabilities";
import { TransferHttpError } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { BrandLoader } from "../../ui/brand";
import { Button } from "../../ui/primitives";
import { colors, fonts } from "../../ui/tokens";
import { ProtectedDocumentViewer } from "../documents/ProtectedDocumentViewer";
import { protectedDocumentError, type ProtectedDocumentSource } from "../documents/useProtectedDocument";
import { ProjectCardHeader } from "./ProjectDetailOverview";
import { formatUtcDate } from "./projectDetailModel";
import { projectDetailTheme } from "./projectDetailTheme";

const ESTIMATE_PDF_MAX_BYTES = 25 * 1024 * 1024;
/** Same ceiling as the design workspace's `VersionActions` download. */
const DESIGN_FILE_MAX_BYTES = 50 * 1024 * 1024;

type DataRecord = Record<string, unknown>;

export interface ProjectDocumentsEstimate {
  readonly id: string;
  readonly statusLabel: string;
}

interface ApprovedDesignFile {
  readonly id: string;
  readonly title: string;
  readonly downloadName: string;
  readonly mimeType: string;
  readonly versionText: string;
  readonly versionSpoken: string;
  readonly approvedOn: string | null;
}

function isRecord(value: unknown): value is DataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function message(cause: unknown, fallback: string): string {
  if (cause instanceof TransferHttpError) return protectedDocumentError(cause).message;
  if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) return "This document is unavailable for your account.";
  return fallback;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Approved versions only, keyed by their stable version id; records without an id cannot be acted on and are skipped. */
function approvedDesignFiles(data: unknown, requireClientVisible: boolean): readonly ApprovedDesignFile[] {
  const items = isRecord(data) && Array.isArray(data.items) ? data.items : [];
  const files: ApprovedDesignFile[] = [];
  items.forEach((item) => {
    if (!isRecord(item) || item.approvalStatus !== "approved" || (requireClientVisible && item.clientVisible !== true) || typeof item.id !== "string" || !item.id) return;
    const versionNumber = typeof item.versionNumber === "number" && Number.isFinite(item.versionNumber) ? item.versionNumber : null;
    const originalFilename = nonEmpty(item.originalFilename);
    files.push({
      id: item.id,
      title: originalFilename ?? (versionNumber === null ? "Design file" : `Design version ${versionNumber}`),
      downloadName: originalFilename ?? `design-${item.id}`,
      mimeType: nonEmpty(item.mimeType) ?? "application/octet-stream",
      versionText: `Version ${versionNumber ?? "—"}`,
      versionSpoken: versionNumber === null ? "Version not recorded" : `Version ${versionNumber}`,
      approvedOn: formatUtcDate(item.approvedAt)
    });
  });
  return files;
}

function hasMoreVersions(data: unknown): boolean {
  return isRecord(data) && isRecord(data.pagination) && data.pagination.hasMore === true;
}

function nextVersionOffset(data: unknown): number {
  if (!isRecord(data) || !isRecord(data.pagination) ||
    typeof data.pagination.offset !== "number" || !Number.isSafeInteger(data.pagination.offset) || data.pagination.offset < 0 ||
    typeof data.pagination.limit !== "number" || !Number.isSafeInteger(data.pagination.limit) || data.pagination.limit <= 0) throw new ApiProtocolError();
  return data.pagination.offset + data.pagination.limit;
}

export function ProjectDocuments({ projectId, estimate, session }: { readonly projectId: string; readonly estimate: ProjectDocumentsEstimate | readonly ProjectDocumentsEstimate[] | null; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  // Remount open viewers when the project or authenticated runtime changes.
  // This also clears an old file title before a new account's query resolves.
  const documentScope = JSON.stringify([
    projectId,
    context.environment.environment.id,
    context.environment.generation,
    context.session.status,
    context.session.generation,
    session.user.id,
    session.user.role
  ]);
  const clientEstimate = session.user.role === "client";
  const estimates = estimate === null ? [] : Array.isArray(estimate) ? estimate : [estimate];
  const canExportEstimate = estimates.length > 0 && canPerformOperation(session, clientEstimate ? "GET /client/estimates/:estimateId/pdf" : "GET /estimates/:estimateId/pdf");
  const canReadDesigns = canPerformOperation(session, "GET /projects/:projectId/design-versions");
  return (
    <View testID="project-documents" style={styles.card}>
      <ProjectCardHeader glyph="file" title="Documents" subtitle="Estimate PDF and approved design files" />
      <View style={styles.body}>
        {canExportEstimate ? estimates.map((item) => <EstimatePdfRow key={`${documentScope}:${item.id}`} estimate={item} clientEstimate={clientEstimate} showId={estimates.length > 1} />) : null}
        {canReadDesigns ? <ApprovedDesignFiles key={documentScope} projectId={projectId} session={session} /> : null}
        {!canExportEstimate && !canReadDesigns ? <Text style={styles.copy}>No documents are available for your access.</Text> : null}
      </View>
    </View>
  );
}

function EstimatePdfRow({ estimate, clientEstimate, showId }: { readonly estimate: ProjectDocumentsEstimate; readonly clientEstimate: boolean; readonly showId: boolean }) {
  const context = useConfiguredRuntime();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const source: ProtectedDocumentSource = {
    path: `/${clientEstimate ? "client/" : ""}estimates/${encodeURIComponent(estimate.id)}/pdf`,
    fileName: `lisno-estimate-${estimate.id}.pdf`,
    mimeType: "application/pdf",
    kind: "estimate-pdf"
  };
  const exportPdf = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const artifact = await context.runtime.transfers.download({
        path: `/${clientEstimate ? "client/" : ""}estimates/${encodeURIComponent(estimate.id)}/pdf`,
        fileName: `lisno-estimate-${estimate.id}.pdf`,
        mimeType: "application/pdf",
        maxBytes: ESTIMATE_PDF_MAX_BYTES
      }).result;
      await artifact.share({ cleanupAfterShare: true });
    } catch (cause) {
      setError(message(cause, "The estimate PDF could not be prepared."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return (
    <View style={styles.group}>
      <View style={styles.row}>
        <View accessible accessibilityLabel={`Estimate PDF, ${estimate.statusLabel}${showId ? `, ${estimate.id}` : ""}`} style={styles.rowCopy}>
          <Text style={styles.rowTitle}>Estimate PDF</Text>
          <Text style={styles.rowMeta}>{estimate.statusLabel}</Text>
          {showId ? <Text style={styles.rowMeta}>Estimate ID: {estimate.id}</Text> : null}
        </View>
        <View style={styles.rowAction}>
          <Button label="Open PDF" variant="secondary" size="compact" accessibilityHint="Opens the estimate in an in-app document viewer" onPress={() => setOpen(true)} />
          <Button label="Export PDF" variant="secondary" size="compact" loading={pending} accessibilityHint="Downloads the estimate PDF and opens the share sheet" onPress={() => void exportPdf()} />
        </View>
      </View>
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
      <ProtectedDocumentViewer visible={open} source={open ? source : null} onClose={() => setOpen(false)} />
    </View>
  );
}

function ApprovedDesignFiles({ projectId, session }: { readonly projectId: string; readonly session: AuthenticatedSession }) {
  const context = useConfiguredRuntime();
  const scope = { environmentId: context.environment.environment.id, userId: session.user.id };
  const [extraPages, setExtraPages] = useState<readonly unknown[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<ApprovedDesignFile | null>(null);
  const loadingMoreRef = useRef(false);
  // Same key and URL as DesignVersionWorkspace, so the cache and `design-workflow-changed` invalidation are shared.
  const query = useQuery({
    queryKey: privateQueryKey(scope, "design", "project", projectId),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<unknown>(`/projects/${encodeURIComponent(projectId)}/design-versions?limit=30&offset=0`, { signal }),
    enabled: canPerformOperation(session, "GET /projects/:projectId/design-versions")
  });
  useEffect(() => { setExtraPages([]); setLoadError(null); }, [query.dataUpdatedAt]);
  const canDownload = canPerformOperation(session, "GET /design-versions/:versionId/download");
  const pages = query.data === undefined ? extraPages : [query.data, ...extraPages];
  const lastPage = pages.at(-1);
  const loadMore = async () => {
    if (loadingMoreRef.current || !lastPage || !hasMoreVersions(lastPage)) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const offset = nextVersionOffset(lastPage);
      const next = await context.runtime.api.authenticated.get<unknown>(`/projects/${encodeURIComponent(projectId)}/design-versions?limit=30&offset=${offset}`);
      if (nextVersionOffset(next) <= offset) throw new ApiProtocolError();
      setExtraPages((current) => [...current, next]);
    } catch (cause) {
      setLoadError(message(cause, "More approved documents could not be loaded."));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };
  let body;
  if (query.isPending) {
    body = <BrandLoader label="Loading documents" tone="dark" />;
  } else if (query.isError) {
    body = (
      <View style={styles.stateBlock}>
        <Text accessibilityLiveRegion="assertive" style={styles.error}>Approved documents could not be loaded.</Text>
        <View style={styles.stateAction}>
          <Button label="Retry" variant="secondary" size="compact" loading={query.isFetching} onPress={() => void query.refetch()} />
        </View>
      </View>
    );
  } else {
    const files = pages.flatMap((page) => approvedDesignFiles(page, session.user.role === "client"));
    body = files.length === 0 ? (
      <Text style={styles.copy}>{lastPage && hasMoreVersions(lastPage) ? "No approved documents in loaded pages yet." : "No approved documents yet."}</Text>
    ) : (
      <View style={styles.list}>
        {files.map((file, index) => <DesignFileRow key={file.id} file={file} canDownload={canDownload} first={index === 0} onOpen={() => setOpenFile(file)} />)}
      </View>
    );
    if (lastPage && (hasMoreVersions(lastPage) || loadError)) {
      body = (
        <View style={styles.stateBlock}>
          {body}
          {loadError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{loadError}</Text> : null}
          {hasMoreVersions(lastPage) ? <View style={styles.stateAction}><Button label={loadError ? "Retry more documents" : "Load more documents"} variant="secondary" size="compact" loading={loadingMore} onPress={() => void loadMore()} /></View> : null}
        </View>
      );
    }
  }
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.subheading}>Approved design files</Text>
      {body}
      <ProtectedDocumentViewer visible={openFile !== null} source={openFile ? {
        path: `/design-versions/${encodeURIComponent(openFile.id)}/download`,
        fileName: openFile.downloadName,
        mimeType: openFile.mimeType,
        kind: "design-file"
      } : null} onClose={() => setOpenFile(null)} />
    </View>
  );
}

function DesignFileRow({ file, canDownload, first, onOpen }: { readonly file: ApprovedDesignFile; readonly canDownload: boolean; readonly first: boolean; readonly onOpen: () => void }) {
  const context = useConfiguredRuntime();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const download = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const artifact = await context.runtime.transfers.download({
        path: `/design-versions/${encodeURIComponent(file.id)}/download`,
        fileName: file.downloadName,
        mimeType: file.mimeType,
        maxBytes: DESIGN_FILE_MAX_BYTES
      }).result;
      await artifact.share({ cleanupAfterShare: true });
    } catch (cause) {
      setError(message(cause, "The design could not be downloaded."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const spoken = [file.title, file.versionSpoken, file.approvedOn ? `Approved ${file.approvedOn}` : null].filter(Boolean).join(", ");
  return (
    <View style={[styles.listItem, first ? null : styles.listItemDivided]}>
      <View style={styles.rowInline}>
        <View accessible accessibilityLabel={spoken} style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{file.title}</Text>
          <Text style={styles.rowMeta}>{file.versionText}</Text>
          {file.approvedOn ? <Text style={styles.rowMeta}>{`Approved ${file.approvedOn}`}</Text> : null}
        </View>
        {canDownload ? (
          <View style={styles.rowAction}>
            <Button label="Open" variant="secondary" size="compact" accessibilityHint={`Opens ${file.title} in an in-app document viewer`} onPress={onOpen} />
            <Button label="Download" variant="secondary" size="compact" loading={pending} accessibilityHint={`Downloads ${file.title} and opens the share sheet`} onPress={() => void download()} />
          </View>
        ) : null}
      </View>
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", minWidth: 0, borderRadius: projectDetailTheme.cardRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  body: { gap: 14, minWidth: 0, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  group: { gap: 8, minWidth: 0 },
  subheading: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.3 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 10, columnGap: 12, minWidth: 0, minHeight: 44, padding: 12, borderRadius: projectDetailTheme.innerRadius, borderWidth: 1, borderColor: colors.border },
  list: { minWidth: 0, borderRadius: projectDetailTheme.innerRadius, borderWidth: 1, borderColor: colors.border },
  listItem: { gap: 6, minWidth: 0, padding: 12 },
  listItemDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowInline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 10, columnGap: 12, minWidth: 0, minHeight: 44 },
  rowCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 2 },
  rowTitle: { flexShrink: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  rowMeta: { flexShrink: 1, color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  rowAction: { flexShrink: 0, minWidth: 120, maxWidth: "100%" },
  stateBlock: { gap: 8, minWidth: 0 },
  stateAction: { alignSelf: "flex-start", minWidth: 120, maxWidth: "100%" },
  copy: { flexShrink: 1, color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  error: { flexShrink: 1, color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }
});
