import { useCallback, useEffect, useRef, useState } from "react";

import {
  InvalidResourcePathError,
  StaleTransferError,
  TransferAuthenticationError,
  TransferHttpError,
  TransferSizeError,
  type DownloadedArtifact
} from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";

export type ProtectedDocumentKind =
  | "plan-page"
  | "drawing-image"
  | "section-image"
  | "estimate-pdf"
  | "design-file";

export interface ProtectedDocumentSource {
  /** A relative API path, with every resource ID encoded by the caller. */
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly kind: ProtectedDocumentKind;
}

/** Limits also bound a response that does not advertise Content-Length. */
export const PROTECTED_DOCUMENT_MAX_BYTES: Readonly<Record<ProtectedDocumentKind, number>> = Object.freeze({
  "plan-page": 25 * 1024 * 1024,
  "drawing-image": 25 * 1024 * 1024,
  "section-image": 25 * 1024 * 1024,
  "estimate-pdf": 25 * 1024 * 1024,
  "design-file": 50 * 1024 * 1024
});

export type ProtectedDocumentErrorKind =
  | "authentication"
  | "denied"
  | "unavailable"
  | "network"
  | "too-large"
  | "share";

export interface ProtectedDocumentError {
  readonly kind: ProtectedDocumentErrorKind;
  readonly message: string;
}

export type ProtectedDocumentStatus = "idle" | "loading" | "ready" | "error";

interface DocumentState {
  readonly identity: string | null;
  readonly status: ProtectedDocumentStatus;
  readonly localUri: string | null;
  readonly error: ProtectedDocumentError | null;
}

const IDLE: DocumentState = Object.freeze({ identity: null, status: "idle", localUri: null, error: null });

/** Deliberately discard raw transfer errors, which may contain private paths or server text. */
export function protectedDocumentError(cause: unknown, phase: "download" | "share" = "download"): ProtectedDocumentError {
  if (cause instanceof TransferSizeError || (cause instanceof TransferHttpError && cause.status === 413)) {
    return { kind: "too-large", message: "This document is too large to open on this device." };
  }
  if (cause instanceof TransferAuthenticationError || cause instanceof StaleTransferError || (cause instanceof TransferHttpError && cause.status === 401)) {
    return { kind: "authentication", message: "Your session changed. Sign in again to open this document." };
  }
  if (cause instanceof TransferHttpError && cause.status === 403) {
    return { kind: "denied", message: "You do not have access to this document." };
  }
  if (cause instanceof InvalidResourcePathError || (cause instanceof TransferHttpError && cause.status === 404)) {
    return { kind: "unavailable", message: "This document is no longer available." };
  }
  if (phase === "share") {
    return { kind: "share", message: "This document could not be downloaded. Try again." };
  }
  return { kind: "network", message: "This document could not be loaded. Check your connection and try again." };
}

export interface ProtectedDocumentResult {
  /** Changes with the source, session, environment, and retry; guards native render callbacks. */
  readonly identity: string | null;
  readonly status: ProtectedDocumentStatus;
  readonly localUri: string | null;
  readonly error: ProtectedDocumentError | null;
  readonly sharing: boolean;
  retry(): void;
  /** Explicit platform share/download fallback, releasing the local copy after the handoff. */
  openExternally(): Promise<boolean>;
}

/** One active source owns one private local artifact. Changing source/session or closing releases it. */
export function useProtectedDocument(source: ProtectedDocumentSource | null, active: boolean): ProtectedDocumentResult {
  const context = useConfiguredRuntime();
  const transfers = context.runtime.transfers;
  const transfersRef = useRef(transfers);
  transfersRef.current = transfers;
  const [retryNumber, setRetryNumber] = useState(0);
  const [state, setState] = useState<DocumentState>(IDLE);
  const [sharingIdentity, setSharingIdentity] = useState<string | null>(null);
  const artifactRef = useRef<{ readonly identity: string; readonly artifact: DownloadedArtifact } | null>(null);
  const sharingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const path = source?.path ?? null;
  const fileName = source?.fileName ?? null;
  const mimeType = source?.mimeType ?? null;
  const kind = source?.kind ?? null;
  const identity = active && source
    ? JSON.stringify([
      path, fileName, mimeType, kind,
      context.environment.environment.id,
      context.environment.generation,
      context.session.status,
      context.session.session?.user.id ?? null,
      context.session.generation,
      retryNumber
    ])
    : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (identity === null || path === null || fileName === null || mimeType === null || kind === null) return;
    let closed = false;
    if (!path.trim() || !fileName.trim() || !mimeType.trim()) {
      setState({
        identity,
        status: "error",
        localUri: null,
        error: { kind: "unavailable", message: "This document is no longer available." }
      });
      return;
    }
    setState({ identity, status: "loading", localUri: null, error: null });
    let transfer: ReturnType<typeof transfers.download>;
    try {
      transfer = transfersRef.current.download({
        path,
        fileName,
        mimeType,
        maxBytes: PROTECTED_DOCUMENT_MAX_BYTES[kind]
      });
    } catch (cause) {
      setState({ identity, status: "error", localUri: null, error: protectedDocumentError(cause) });
      return;
    }

    void transfer.result.then((artifact) => {
      if (closed || !mountedRef.current) {
        void artifact.release();
        return;
      }
      artifactRef.current = { identity, artifact };
      setState({ identity, status: "ready", localUri: artifact.uri, error: null });
    }).catch((cause: unknown) => {
      if (closed || !mountedRef.current) return;
      setState({ identity, status: "error", localUri: null, error: protectedDocumentError(cause) });
    });

    return () => {
      closed = true;
      transfer.cancel();
      const held = artifactRef.current;
      if (held?.identity === identity) {
        artifactRef.current = null;
        void held.artifact.release();
      }
      if (mountedRef.current) {
        setState((current) => current.identity === identity ? IDLE : current);
      }
    };
  }, [fileName, identity, kind, mimeType, path]);

  const retry = useCallback(() => {
    if (active && source && sharingRef.current === null) setRetryNumber((value) => value + 1);
  }, [active, source]);

  const openExternally = useCallback(async (): Promise<boolean> => {
    if (!identity || sharingRef.current !== null) return false;
    const held = artifactRef.current;
    if (!held || held.identity !== identity) return false;
    sharingRef.current = identity;
    setSharingIdentity(identity);
    try {
      await held.artifact.share({ cleanupAfterShare: true });
      const stillCurrent = mountedRef.current && artifactRef.current === held;
      if (stillCurrent) {
        artifactRef.current = null;
        setState({ identity, status: "idle", localUri: null, error: null });
      }
      return stillCurrent;
    } catch (cause) {
      if (mountedRef.current && artifactRef.current === held) {
        artifactRef.current = null;
        setState({ identity, status: "error", localUri: null, error: protectedDocumentError(cause, "share") });
      }
      return false;
    } finally {
      await held.artifact.release().catch(() => undefined);
      if (sharingRef.current === identity) sharingRef.current = null;
      if (mountedRef.current) setSharingIdentity((current) => current === identity ? null : current);
    }
  }, [identity]);

  const current: DocumentState = identity === null
    ? IDLE
    : state.identity === identity
      ? state
      : { identity, status: "loading", localUri: null, error: null };
  return {
    identity,
    status: current.status,
    localUri: current.localUri,
    error: current.error,
    sharing: identity !== null && sharingIdentity === identity,
    retry,
    openExternally
  };
}
