import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData
} from "react-native";

import type { AuthenticatedSession } from "../../contracts/session";
import { ApiError } from "../../core/http/apiClient";
import { AudioRecordingInterruptedError } from "../../platform/audio";
import {
  capturePhoto,
  clearPendingImageSelection,
  OversizedAssetPolicyError,
  pickDocument,
  pickImage,
  releaseSelectedAsset,
  recoverPendingImageSelection,
  TransferHttpError,
  type CancellableTransfer,
  type ImageSelectionScope,
  type SelectedAsset
} from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  createClientMessageId,
  createClientUploadId,
  type PresentedMessage,
  type PresentedPriority
} from "./chatModel";
import { chatQueryKeys } from "./chatQueryKeys";
import { ComposerTray, type StagedChatAttachment } from "./ComposerTray";
import {
  AttachmentOptionsSheet,
  type AttachmentOptionSource
} from "./AttachmentOptionsSheet";
import { ChatIcon } from "./ChatIcon";
import { chatColors } from "./chatTheme";

interface AttachmentPolicy {
  readonly enabled: boolean;
  readonly capabilities: { readonly canUpload: boolean; readonly canRecord: boolean };
  readonly limits: {
    readonly maxAttachments: number;
    readonly maxFileBytes: number;
    readonly maxMessageBytes: number;
    readonly maxRecordingSeconds: number;
  };
  readonly formats: readonly {
    readonly kind: "image" | "video" | "audio" | "document" | "archive";
    readonly label: string;
    readonly extensions: readonly string[];
    readonly mimeTypes: readonly string[];
  }[];
  readonly recordingMimeTypes: readonly string[];
}

interface ComposerOwner {
  readonly key: string;
  readonly environmentId: string;
  readonly environmentGeneration: number;
  readonly userId: string;
  readonly sessionGeneration: number;
  readonly projectId: string;
}

interface ComposerOperation extends ComposerOwner {
  readonly epoch: number;
}

interface UploadAttempt {
  readonly operation: ComposerOperation;
  readonly assetUri: string;
}

interface SendMutationVariables {
  readonly operation: ComposerOperation;
  readonly payload: SendChatMessagePayload;
}

function ownerKey(input: Omit<ComposerOwner, "key">): string {
  return [
    input.environmentId,
    input.environmentGeneration,
    input.userId,
    input.sessionGeneration,
    input.projectId
  ].join("\u001f");
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const SAFE_DOMAIN_ERROR_MESSAGES = new Set([
  "The selected file location is not supported.",
  "The selected file name is invalid.",
  "The selected file is empty or unreadable.",
  "The selected file is larger than allowed.",
  "The selected file type is not supported.",
  "The selected image dimensions are invalid.",
  "No image was returned by the picker.",
  "No file was returned by the picker."
]);

const SAFE_ERROR_MESSAGES_BY_CODE = new Map<string, string>([
  ["ASSET_SIZE_UNAVAILABLE", "The selected file size could not be determined."],
  ["PENDING_IMAGE_SELECTION_UNAVAILABLE", "The image picker could not be opened safely."],
  ["AUDIO_PERMISSION_DENIED", "Microphone permission is required to record a voice note."],
  ["AUDIO_RECORDING_INTERRUPTED", "The audio operation was interrupted."],
  ["TRANSFER_AUTHENTICATION_REQUIRED", "Authentication is required for this file transfer."],
  ["TRANSFER_SIZE_LIMIT", "The selected attachment is larger than allowed."],
  ["TRANSFER_CANCELLED", "The file transfer was cancelled."],
  ["STALE_TRANSFER", "The transfer belongs to an obsolete session or backend environment."]
]);

const CAMERA_SETTINGS_ERROR = "Camera access is off. Enable it in Android Settings to take a photo.";

function boundedMessage(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized && normalized.length <= 240 ? normalized : fallback;
}

function composerError(cause: unknown, fallback: string): string {
  if (cause instanceof OversizedAssetPolicyError) {
    return `${cause.fileName} exceeds the ${formatBytes(cause.maxBytes)} per-file limit.`;
  }
  if (cause instanceof ApiError || cause instanceof TransferHttpError) {
    return boundedMessage(cause.message, fallback);
  }
  if (!(cause instanceof Error)) return fallback;
  const code = "code" in cause && typeof cause.code === "string" ? cause.code : null;
  if (code === "ASSET_POLICY_ERROR" && SAFE_DOMAIN_ERROR_MESSAGES.has(cause.message)) {
    return cause.message;
  }
  return (code && SAFE_ERROR_MESSAGES_BY_CODE.get(code)) ?? fallback;
}

function isAccessDenied(cause: unknown): boolean {
  return (cause instanceof ApiError || cause instanceof TransferHttpError) && [401, 403, 404].includes(cause.status);
}

export function canSubmitChatMessage(input: {
  readonly body: string;
  readonly stagedCount: number;
  readonly pending: boolean;
  readonly uploading: boolean;
  readonly recording: boolean;
}): boolean {
  return !input.pending && !input.uploading && !input.recording && (Boolean(input.body.trim()) || input.stagedCount > 0);
}

interface SendChatMessagePayload {
  readonly body: string;
  readonly attachmentIds?: readonly string[];
  readonly mentions: readonly string[];
  readonly priority: PresentedPriority;
  readonly replyToId: string | null;
  readonly responsibleUserId: null;
  readonly clientMessageId: string;
}

export interface ChatComposerHandle {
  hasTransientState(): boolean;
  dismissTransientState(): boolean;
}

export interface ChatComposerProps {
  readonly projectId: string;
  readonly session: AuthenticatedSession;
  readonly reply: PresentedMessage | null;
  readonly onCancelReply: () => void;
  readonly onSent: () => void | Promise<void>;
  readonly onDenied?: () => void;
  readonly onSendingChange?: (sending: boolean) => void;
  readonly onOverlayChange?: (open: boolean) => void;
  readonly compact?: boolean;
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  projectId,
  session,
  reply,
  onCancelReply,
  onSent,
  onDenied,
  onSendingChange,
  onOverlayChange,
  compact = true
}, ref) {
  const context = useConfiguredRuntime();
  const queryClient = useQueryClient();
  const scope = useMemo(() => ({
    environmentId: context.environment.environment.id,
    userId: session.user.id
  }), [context.environment.environment.id, session.user.id]);
  const owner = useMemo<ComposerOwner>(() => {
    const value = {
      environmentId: context.environment.environment.id,
      environmentGeneration: context.environment.generation,
      userId: session.user.id,
      sessionGeneration: context.session.generation,
      projectId
    };
    return { ...value, key: ownerKey(value) };
  }, [
    context.environment.environment.id,
    context.environment.generation,
    context.session.generation,
    projectId,
    session.user.id
  ]);
  const selectionScope = useMemo<ImageSelectionScope>(() => ({
    environmentId: owner.environmentId,
    userId: owner.userId,
    projectId: owner.projectId,
    sessionGeneration: owner.sessionGeneration
  }), [owner.environmentId, owner.projectId, owner.sessionGeneration, owner.userId]);
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<PresentedPriority>("normal");
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [selectingSource, setSelectingSource] = useState<AttachmentOptionSource | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [selectedIsVoiceNote, setSelectedIsVoiceNote] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [recordingStopping, setRecordingStopping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [recordingNotice, setRecordingNotice] = useState<string | null>(null);
  const [staged, setStaged] = useState<readonly StagedChatAttachment[]>([]);
  const [removingStagedCount, setRemovingStagedCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const clientMessageId = useRef(createClientMessageId());
  const sendSnapshot = useRef<SendChatMessagePayload | null>(null);
  const uploadId = useRef(createClientUploadId());
  const stagedRef = useRef(staged);
  const selectedRef = useRef(selectedAsset);
  const recordingUriRef = useRef(recordingUri);
  const activeUpload = useRef<CancellableTransfer<StagedChatAttachment> | null>(null);
  const uploadAttemptRef = useRef<UploadAttempt | null>(null);
  const stagedRemovalsRef = useRef(new Map<string, ComposerOperation>());
  const localInputRef = useRef<SelectedAsset | null>(null);
  const inputRef = useRef<TextInput>(null);
  const paperclipRef = useRef<View>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const mountedRef = useRef(true);
  const operationEpochRef = useRef(0);
  const renderedOwnerRef = useRef(owner);
  const resourceOwnerRef = useRef(owner);
  const recoveryOwnerRef = useRef<string | null>(null);
  const selectionOperationRef = useRef<ComposerOperation | null>(null);
  const voiceStartAttemptRef = useRef(0);
  const voiceStartLockedRef = useRef(false);
  const voiceStopLockedRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingOwnerRef = useRef<ComposerOperation | null>(null);
  const lastReplyId = useRef(reply?.id ?? null);
  const pendingRef = useRef(false);
  const resetSendStateRef = useRef<() => void>(() => undefined);
  stagedRef.current = staged;
  selectedRef.current = selectedAsset;
  recordingUriRef.current = recordingUri;

  if (renderedOwnerRef.current.key !== owner.key) {
    operationEpochRef.current += 1;
    renderedOwnerRef.current = owner;
  }

  const captureOperation = useCallback((): ComposerOperation => ({
    ...renderedOwnerRef.current,
    epoch: operationEpochRef.current
  }), []);

  const isOperationCurrent = useCallback((operation: ComposerOperation): boolean => (
    mountedRef.current &&
    operation.epoch === operationEpochRef.current &&
    operation.key === renderedOwnerRef.current.key
  ), []);

  const releaseLocalInput = useCallback((expectedUri?: string): Promise<void> => {
    const asset = localInputRef.current;
    if (!asset || (expectedUri && asset.uri !== expectedUri)) return Promise.resolve();
    localInputRef.current = null;
    return releaseSelectedAsset(asset).catch(() => undefined);
  }, []);

  const policy = useQuery({
    queryKey: chatQueryKeys.attachmentPolicy(scope, projectId),
    queryFn: ({ signal }) => context.runtime.api.authenticated.get<AttachmentPolicy>(
      `/projects/${encodeURIComponent(projectId)}/chat/attachment-policy`,
      { signal }
    ),
    staleTime: 60_000,
    retry: (count, cause) => !(cause instanceof ApiError && [401, 403, 404].includes(cause.status)) && count < 1
  });

  const renewDraftIdentity = useCallback(() => {
    clientMessageId.current = createClientMessageId();
    sendSnapshot.current = null;
    setError(null);
    if (!pendingRef.current) resetSendStateRef.current();
  }, []);
  const allMimeTypes = useMemo(
    () => [...new Set(policy.data?.formats.flatMap((format) => format.mimeTypes) ?? [])],
    [policy.data?.formats]
  );
  const imageMimeTypes = useMemo(
    () => [...new Set(
      policy.data?.formats
        .filter((format) => format.kind === "image")
        .flatMap((format) => format.mimeTypes)
        .filter((mimeType) => mimeType.toLowerCase().startsWith("image/")) ?? []
    )],
    [policy.data?.formats]
  );

  const revokeComposerAccess = useCallback(() => {
    const currentSelectionScope: ImageSelectionScope = {
      environmentId: renderedOwnerRef.current.environmentId,
      userId: renderedOwnerRef.current.userId,
      projectId: renderedOwnerRef.current.projectId,
      sessionGeneration: renderedOwnerRef.current.sessionGeneration
    };
    operationEpochRef.current += 1;
    voiceStartAttemptRef.current += 1;
    voiceStartLockedRef.current = false;
    voiceStopLockedRef.current = false;
    recordingOwnerRef.current = null;
    recordingStartedAtRef.current = null;
    const recordingToRelease = recordingUriRef.current;
    activeUpload.current?.cancel();
    activeUpload.current = null;
    uploadAttemptRef.current = null;
    void releaseLocalInput();
    stagedRemovalsRef.current.clear();
    selectionOperationRef.current = null;
    void clearPendingImageSelection(currentSelectionScope).catch(() => undefined);
    void context.runtime.audio.cancelRecording();
    if (recordingToRelease) {
      void context.runtime.audio.releaseRecording(recordingToRelease).catch(() => undefined);
    }
    stagedRef.current = [];
    selectedRef.current = null;
    recordingUriRef.current = null;
    sendSnapshot.current = null;
    setAccessRevoked(true);
    setBody("");
    setPriority("normal");
    setPriorityOpen(false);
    setAttachmentOpen(false);
    setSelectingSource(null);
    setSelectedAsset(null);
    setSelectedIsVoiceNote(false);
    setRecordingUri(null);
    setRecordingStarting(false);
    setRecordingStopping(false);
    setRecording(false);
    setRecordingElapsedSeconds(0);
    setRecordingNotice(null);
    setStaged([]);
    setRemovingStagedCount(0);
    setUploading(false);
    setUploadProgress(null);
    setError("Messages are unavailable.");
    onDenied?.();
  }, [context.runtime.audio, onDenied, releaseLocalInput]);

  useEffect(() => {
    if (policy.isError && isAccessDenied(policy.error)) revokeComposerAccess();
  }, [policy.error, policy.isError, revokeComposerAccess]);

  const uploadAsset = useCallback(async (
    asset: SelectedAsset,
    options: {
      readonly operation?: ComposerOperation;
      readonly voiceNote?: boolean;
    } = {}
  ) => {
    const operation = options.operation ?? captureOperation();
    if (
      !isOperationCurrent(operation) ||
      pendingRef.current ||
      stagedRemovalsRef.current.size > 0 ||
      uploadAttemptRef.current ||
      activeUpload.current
    ) return;
    const value = policy.data;
    if (!value?.enabled || !value.capabilities.canUpload || accessRevoked) return;
    if (!Number.isSafeInteger(asset.size) || asset.size < 1) {
      setError("The selected attachment size is unavailable.");
      return;
    }
    if (stagedRef.current.length + 1 > value.limits.maxAttachments) {
      setError(`A message can include up to ${value.limits.maxAttachments} attachments.`);
      return;
    }
    if (asset.size > value.limits.maxFileBytes) {
      setError(`${asset.name} exceeds the ${formatBytes(value.limits.maxFileBytes)} per-file limit.`);
      return;
    }
    const stagedBytes = stagedRef.current.reduce(
      (total, item) => total + item.attachment.byteSize,
      0
    );
    if (stagedBytes + asset.size > value.limits.maxMessageBytes) {
      setError(`Attachments must stay within ${formatBytes(value.limits.maxMessageBytes)} per message.`);
      return;
    }

    const uploadAttempt: UploadAttempt = { operation, assetUri: asset.uri };
    uploadAttemptRef.current = uploadAttempt;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    let transfer: CancellableTransfer<StagedChatAttachment> | null = null;
    try {
      transfer = context.runtime.transfers.upload<StagedChatAttachment>({
        path: `/projects/${encodeURIComponent(operation.projectId)}/chat/attachments?uploadId=${encodeURIComponent(uploadId.current)}&sizeBytes=${asset.size}`,
        fileUri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType,
        maxBytes: value.limits.maxFileBytes,
        onProgress: (progress) => {
          if (isOperationCurrent(operation) && activeUpload.current === transfer) {
            setUploadProgress(progress.fraction);
          }
        }
      });
      activeUpload.current = transfer;
      const result = await transfer.result;
      if (!isOperationCurrent(operation) || activeUpload.current !== transfer) return;
      const stagedResult: StagedChatAttachment = options.voiceNote
        ? { ...result, isVoiceNote: true }
        : result;
      stagedRef.current = [...stagedRef.current, stagedResult];
      setStaged(stagedRef.current);
      setSelectedAsset(null);
      setSelectedIsVoiceNote(false);
      selectedRef.current = null;
      setUploadProgress(null);
      setRecordingNotice(null);
      uploadId.current = createClientUploadId();
      renewDraftIdentity();
      if (!options.voiceNote) {
        void releaseLocalInput(asset.uri);
      } else if (recordingUriRef.current === asset.uri) {
        const localRecordingUri = recordingUriRef.current;
        recordingUriRef.current = null;
        setRecordingUri(null);
        await context.runtime.audio.releaseRecording(localRecordingUri).catch(() => undefined);
      }
    } catch (cause) {
      if (
        !isOperationCurrent(operation) ||
        uploadAttemptRef.current !== uploadAttempt ||
        (transfer ? activeUpload.current !== transfer : activeUpload.current !== null)
      ) return;
      if (isAccessDenied(cause)) {
        revokeComposerAccess();
        return;
      }
      setRecordingNotice(null);
      setError(composerError(cause, "The attachment upload could not be confirmed. Retry keeps the same upload identity."));
    } finally {
      if (transfer && activeUpload.current === transfer) activeUpload.current = null;
      if (uploadAttemptRef.current === uploadAttempt) {
        uploadAttemptRef.current = null;
        if (isOperationCurrent(operation)) setUploading(false);
      }
    }
  }, [
    accessRevoked,
    captureOperation,
    context.runtime.audio,
    context.runtime.transfers,
    isOperationCurrent,
    policy.data,
    releaseLocalInput,
    renewDraftIdentity,
    revokeComposerAccess
  ]);

  const stageSelectedAsset = useCallback(async (
    asset: SelectedAsset,
    operation: ComposerOperation,
    voiceNote = false,
    localInput: SelectedAsset | null = null
  ) => {
    if (
      !isOperationCurrent(operation) ||
      pendingRef.current ||
      stagedRemovalsRef.current.size > 0
    ) {
      if (localInput) await releaseSelectedAsset(localInput).catch(() => undefined);
      return;
    }
    if (localInput) {
      const previousInput = localInputRef.current;
      localInputRef.current = localInput;
      if (previousInput && previousInput !== localInput) {
        void releaseSelectedAsset(previousInput).catch(() => undefined);
      }
    }
    selectedRef.current = asset;
    setSelectedAsset(asset);
    setSelectedIsVoiceNote(voiceNote);
    uploadId.current = createClientUploadId();
    renewDraftIdentity();
    await uploadAsset(asset, { operation, voiceNote });
  }, [isOperationCurrent, renewDraftIdentity, uploadAsset]);

  useEffect(() => {
    const unsubscribe = context.runtime.audio.subscribeRecordingEvents((event) => {
      const operation = recordingOwnerRef.current;
      if (!operation || !isOperationCurrent(operation)) {
        if (event.type === "completed") {
          void context.runtime.audio.releaseRecording(event.recording.uri).catch(() => undefined);
        }
        return;
      }
      voiceStartAttemptRef.current += 1;
      voiceStartLockedRef.current = false;
      voiceStopLockedRef.current = false;
      recordingOwnerRef.current = null;
      recordingStartedAtRef.current = null;
      setRecording(false);
      setRecordingStopping(false);
      setRecordingElapsedSeconds(0);
      if (event.type === "completed") {
        const asset: SelectedAsset = {
          uri: event.recording.uri,
          name: event.recording.fileName,
          mimeType: event.recording.mimeType,
          size: event.recording.sizeBytes
        };
        recordingUriRef.current = event.recording.uri;
        setRecordingUri(event.recording.uri);
        setRecordingNotice(event.reason === "duration_limit"
          ? "Recording limit reached. Preparing your voice note…"
          : "Preparing voice note…");
        setError(null);
        void stageSelectedAsset(asset, operation, true);
      } else if (event.type === "interrupted") {
        recordingUriRef.current = null;
        selectedRef.current = null;
        setRecordingUri(null);
        setSelectedAsset(null);
        setSelectedIsVoiceNote(false);
        setRecordingNotice(null);
        if (event.reason === "background") {
          setError("Voice recording was discarded when Lisno left the foreground.");
        }
      } else {
        recordingUriRef.current = null;
        selectedRef.current = null;
        setRecordingUri(null);
        setSelectedAsset(null);
        setSelectedIsVoiceNote(false);
        setRecordingNotice(null);
        setError(composerError(event.error, "The voice note could not be completed."));
      }
    });
    return () => unsubscribe();
  }, [context.runtime.audio, isOperationCurrent, stageSelectedAsset]);

  const send = useMutation({
    retry: false,
    mutationFn: ({ operation, payload }: SendMutationVariables) => (
      context.runtime.api.authenticated.post(
        `/projects/${encodeURIComponent(operation.projectId)}/chat/messages`,
        payload
      )
    ),
    onSuccess: async (_result, variables: SendMutationVariables) => {
      if (!isOperationCurrent(variables.operation)) return;
      const { operation, payload } = variables;
      sendSnapshot.current = null;
      stagedRef.current = [];
      setStaged([]);
      setBody("");
      setPriority("normal");
      setError(null);
      clientMessageId.current = createClientMessageId();
      if ((reply?.id ?? null) === payload.replyToId) onCancelReply();
      const frozenScope = {
        environmentId: operation.environmentId,
        userId: operation.userId
      };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.project(frozenScope, operation.projectId) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversations(frozenScope) })
      ]);
      if (isOperationCurrent(operation)) await onSent();
    },
    onError: (cause, variables: SendMutationVariables) => {
      if (!isOperationCurrent(variables.operation)) return;
      if (isAccessDenied(cause)) {
        revokeComposerAccess();
        return;
      }
      setError(cause instanceof ApiError
        ? cause.message
        : "Delivery could not be confirmed. Retry sends the same message identity safely.");
    },
    onSettled: (_result, _cause, variables: SendMutationVariables) => {
      if (isOperationCurrent(variables.operation)) pendingRef.current = false;
    }
  });
  pendingRef.current = send.isPending;
  resetSendStateRef.current = send.reset;

  useEffect(() => {
    onSendingChange?.(send.isPending);
  }, [onSendingChange, send.isPending]);

  useEffect(() => {
    onOverlayChange?.(attachmentOpen || priorityOpen || Boolean(selectingSource));
    return () => onOverlayChange?.(false);
  }, [attachmentOpen, onOverlayChange, priorityOpen, selectingSource]);

  useEffect(() => () => {
    onSendingChange?.(false);
  }, [onSendingChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationEpochRef.current += 1;
      voiceStartAttemptRef.current += 1;
      voiceStartLockedRef.current = false;
      voiceStopLockedRef.current = false;
      recordingOwnerRef.current = null;
      recordingStartedAtRef.current = null;
      const pendingRemovalIds = new Set(stagedRemovalsRef.current.keys());
      activeUpload.current?.cancel();
      activeUpload.current = null;
      uploadAttemptRef.current = null;
      void releaseLocalInput();
      stagedRemovalsRef.current.clear();
      selectionOperationRef.current = null;
      void context.runtime.audio.cancelRecording();
      if (recordingUriRef.current) {
        void context.runtime.audio.releaseRecording(recordingUriRef.current).catch(() => undefined);
      }
      const cleanupOwner = resourceOwnerRef.current;
      if (!pendingRef.current) {
        for (const item of stagedRef.current) {
          if (pendingRemovalIds.has(item.attachment.id)) continue;
          void context.runtime.api.authenticated.delete(
            `/projects/${encodeURIComponent(cleanupOwner.projectId)}/chat/attachments/${encodeURIComponent(item.attachment.id)}`
          ).catch(() => undefined);
        }
      }
    };
  }, [context.runtime.api.authenticated, context.runtime.audio, releaseLocalInput]);

  useEffect(() => {
    const previousOwner = resourceOwnerRef.current;
    if (previousOwner.key === owner.key) return;
    resourceOwnerRef.current = owner;
    const previousStaged = stagedRef.current;
    const previousRecordingUri = recordingUriRef.current;
    const previousSendPending = pendingRef.current;
    const previousRemovalIds = new Set(stagedRemovalsRef.current.keys());
    const previousSelectionScope: ImageSelectionScope = {
      environmentId: previousOwner.environmentId,
      userId: previousOwner.userId,
      projectId: previousOwner.projectId,
      sessionGeneration: previousOwner.sessionGeneration
    };

    voiceStartAttemptRef.current += 1;
    voiceStartLockedRef.current = false;
    voiceStopLockedRef.current = false;
    recordingOwnerRef.current = null;
    recordingStartedAtRef.current = null;
    activeUpload.current?.cancel();
    activeUpload.current = null;
    uploadAttemptRef.current = null;
    void releaseLocalInput();
    stagedRemovalsRef.current.clear();
    void context.runtime.audio.cancelRecording();
    if (previousRecordingUri) {
      void context.runtime.audio.releaseRecording(previousRecordingUri).catch(() => undefined);
    }
    if (!previousSendPending) {
      for (const item of previousStaged) {
        if (previousRemovalIds.has(item.attachment.id)) continue;
        void context.runtime.api.authenticated.delete(
          `/projects/${encodeURIComponent(previousOwner.projectId)}/chat/attachments/${encodeURIComponent(item.attachment.id)}`
        ).catch(() => undefined);
      }
    }
    void clearPendingImageSelection(previousSelectionScope).catch(() => undefined);

    stagedRef.current = [];
    selectedRef.current = null;
    recordingUriRef.current = null;
    recoveryOwnerRef.current = null;
    selectionOperationRef.current = null;
    pendingRef.current = false;
    sendSnapshot.current = null;
    clientMessageId.current = createClientMessageId();
    uploadId.current = createClientUploadId();
    send.reset();
    setAccessRevoked(false);
    setBody("");
    setPriority("normal");
    setPriorityOpen(false);
    setAttachmentOpen(false);
    setSelectingSource(null);
    setSelectedAsset(null);
    setSelectedIsVoiceNote(false);
    setRecordingUri(null);
    setRecordingStarting(false);
    setRecordingStopping(false);
    setRecording(false);
    setRecordingElapsedSeconds(0);
    setRecordingNotice(null);
    setStaged([]);
    setRemovingStagedCount(0);
    setUploading(false);
    setUploadProgress(null);
    setError(null);
  }, [
    context.runtime.api.authenticated,
    context.runtime.audio,
    owner,
    releaseLocalInput,
    send
  ]);

  useEffect(() => {
    if (!recording || recordingStartedAtRef.current === null) return;
    const updateElapsed = () => {
      const startedAt = recordingStartedAtRef.current;
      if (startedAt === null) return;
      setRecordingElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    if (
      policy.isPending ||
      policy.isError ||
      !policy.data ||
      recoveryOwnerRef.current === owner.key ||
      accessRevoked
    ) return;
    if (!policy.data.enabled || !policy.data.capabilities.canUpload || !imageMimeTypes.length) {
      recoveryOwnerRef.current = owner.key;
      void clearPendingImageSelection(selectionScope).catch(() => undefined);
      return;
    }
    const operation = captureOperation();
    if (selectionOperationRef.current) return;
    recoveryOwnerRef.current = owner.key;
    selectionOperationRef.current = operation;
    setSelectingSource("photo");
    void (async () => {
      let pickerActive = true;
      const finishPickerActivity = () => {
        if (!pickerActive) return;
        pickerActive = false;
        if (selectionOperationRef.current === operation) selectionOperationRef.current = null;
        if (isOperationCurrent(operation)) setSelectingSource(null);
      };
      try {
        const result = await recoverPendingImageSelection({
          acceptedMimeTypes: imageMimeTypes,
          maxBytes: policy.data.limits.maxFileBytes
        }, selectionScope);
        finishPickerActivity();
        if (result.status !== "selected") return;
        if (!isOperationCurrent(operation)) {
          await releaseSelectedAsset(result.asset).catch(() => undefined);
          return;
        }
        await stageSelectedAsset(result.asset, operation, false, result.asset);
      } catch (cause) {
        finishPickerActivity();
        if (isOperationCurrent(operation)) {
          setError(composerError(cause, "The returned photo could not be restored."));
        }
      } finally {
        finishPickerActivity();
      }
    })();
  }, [
    accessRevoked,
    captureOperation,
    imageMimeTypes,
    isOperationCurrent,
    owner.key,
    policy.data,
    policy.isError,
    policy.isPending,
    selectionScope,
    stageSelectedAsset
  ]);

  useEffect(() => {
    const nextReplyId = reply?.id ?? null;
    if (lastReplyId.current === nextReplyId) return;
    lastReplyId.current = nextReplyId;
    renewDraftIdentity();
  }, [renewDraftIdentity, reply?.id]);

  const closeAttachmentOptions = useCallback(() => {
    if (!pendingRef.current && stagedRemovalsRef.current.size === 0) setAttachmentOpen(false);
  }, []);

  const restorePaperclipFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const handle = findNodeHandle(paperclipRef.current);
      if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, []);

  const chooseSource = useCallback(async (source: AttachmentOptionSource) => {
    const value = policy.data;
    if (
      !value?.enabled ||
      !value.capabilities.canUpload ||
      accessRevoked ||
      uploading ||
      selectingSource ||
      selectionOperationRef.current ||
      recording ||
      recordingStarting ||
      stagedRemovalsRef.current.size > 0 ||
      pendingRef.current
    ) return;
    const acceptedMimeTypes = source === "file" ? allMimeTypes : imageMimeTypes;
    if (!acceptedMimeTypes.length) return;
    const operation = captureOperation();
    selectionOperationRef.current = operation;
    setAttachmentOpen(false);
    setSelectingSource(source);
    setError(null);
    let pickerActive = true;
    const finishPickerActivity = () => {
      if (!pickerActive) return;
      pickerActive = false;
      if (selectionOperationRef.current === operation) selectionOperationRef.current = null;
      if (isOperationCurrent(operation)) setSelectingSource(null);
    };
    try {
      await nextFrame();
      if (!isOperationCurrent(operation)) return;
      const assetPolicy = {
        acceptedMimeTypes,
        maxBytes: value.limits.maxFileBytes
      };
      const result = source === "file"
        ? await pickDocument(assetPolicy)
        : source === "photo"
          ? await pickImage(assetPolicy, selectionScope)
          : await capturePhoto(assetPolicy, selectionScope);
      finishPickerActivity();
      if (!isOperationCurrent(operation)) {
        if (result.status === "selected") {
          await releaseSelectedAsset(result.asset).catch(() => undefined);
        }
        return;
      }
      if (result.status === "permission-denied-temporary") {
        setError("Camera access is needed to take a photo.");
        return;
      }
      if (result.status === "permission-denied-permanent") {
        setError(CAMERA_SETTINGS_ERROR);
        return;
      }
      if (result.status === "unavailable") {
        setError("The camera is unavailable right now. You can still choose a photo or file.");
        return;
      }
      if (result.status !== "selected") return;
      if (recordingUriRef.current) {
        const previousRecordingUri = recordingUriRef.current;
        recordingUriRef.current = null;
        setRecordingUri(null);
        await context.runtime.audio.releaseRecording(previousRecordingUri).catch(() => undefined);
      }
      if (!isOperationCurrent(operation)) {
        await releaseSelectedAsset(result.asset).catch(() => undefined);
        return;
      }
      await stageSelectedAsset(result.asset, operation, false, result.asset);
    } catch (cause) {
      finishPickerActivity();
      if (isOperationCurrent(operation)) {
        setError(composerError(cause, "The attachment could not be selected."));
      }
    } finally {
      finishPickerActivity();
    }
  }, [
    accessRevoked,
    allMimeTypes,
    captureOperation,
    context.runtime.audio,
    imageMimeTypes,
    isOperationCurrent,
    policy.data,
    recording,
    recordingStarting,
    selectingSource,
    selectionScope,
    stageSelectedAsset,
    uploading
  ]);

  const clearSelected = useCallback(async () => {
    if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
    const operation = captureOperation();
    voiceStartAttemptRef.current += 1;
    voiceStartLockedRef.current = false;
    voiceStopLockedRef.current = false;
    recordingOwnerRef.current = null;
    recordingStartedAtRef.current = null;
    activeUpload.current?.cancel();
    activeUpload.current = null;
    uploadAttemptRef.current = null;
    const releaseInput = releaseLocalInput();
    if (recording || recordingStarting || recordingStopping) {
      await context.runtime.audio.cancelRecording().catch(() => undefined);
    }
    if (recordingUriRef.current) {
      await context.runtime.audio.releaseRecording(recordingUriRef.current).catch(() => undefined);
    }
    await releaseInput;
    if (!isOperationCurrent(operation)) return;
    recordingUriRef.current = null;
    selectedRef.current = null;
    setRecording(false);
    setRecordingStarting(false);
    setRecordingStopping(false);
    setRecordingElapsedSeconds(0);
    setRecordingUri(null);
    setSelectedAsset(null);
    setSelectedIsVoiceNote(false);
    setUploading(false);
    setUploadProgress(null);
    setRecordingNotice(null);
    uploadId.current = createClientUploadId();
    renewDraftIdentity();
  }, [
    captureOperation,
    context.runtime.audio,
    isOperationCurrent,
    recording,
    recordingStarting,
    recordingStopping,
    releaseLocalInput,
    renewDraftIdentity
  ]);

  const removeStaged = useCallback(async (item: StagedChatAttachment) => {
    if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
    const operation = captureOperation();
    stagedRemovalsRef.current.set(item.attachment.id, operation);
    setRemovingStagedCount(stagedRemovalsRef.current.size);
    try {
      await context.runtime.api.authenticated.delete(
        `/projects/${encodeURIComponent(operation.projectId)}/chat/attachments/${encodeURIComponent(item.attachment.id)}`
      );
      if (!isOperationCurrent(operation)) return;
      stagedRef.current = stagedRef.current.filter(
        (candidate) => candidate.attachment.id !== item.attachment.id
      );
      setStaged(stagedRef.current);
      renewDraftIdentity();
    } catch (cause) {
      if (!isOperationCurrent(operation)) return;
      if (isAccessDenied(cause)) {
        revokeComposerAccess();
        return;
      }
      setError(composerError(cause, "The staged attachment could not be removed."));
    } finally {
      if (stagedRemovalsRef.current.get(item.attachment.id) === operation) {
        stagedRemovalsRef.current.delete(item.attachment.id);
        if (isOperationCurrent(operation)) {
          setRemovingStagedCount(stagedRemovalsRef.current.size);
        }
      }
    }
  }, [
    captureOperation,
    context.runtime.api.authenticated,
    isOperationCurrent,
    renewDraftIdentity,
    revokeComposerAccess
  ]);

  const startVoice = useCallback(async () => {
    const value = policy.data;
    if (
      !value?.enabled ||
      !value.capabilities.canRecord ||
      accessRevoked ||
      uploading ||
      selectingSource ||
      selectedRef.current ||
      recording ||
      voiceStartLockedRef.current ||
      stagedRemovalsRef.current.size > 0 ||
      pendingRef.current
    ) return;
    const operation = captureOperation();
    const attempt = ++voiceStartAttemptRef.current;
    voiceStartLockedRef.current = true;
    recordingOwnerRef.current = operation;
    setAttachmentOpen(false);
    setPriorityOpen(false);
    setRecordingStarting(true);
    setRecordingElapsedSeconds(0);
    setRecordingNotice(null);
    setError(null);
    try {
      await context.runtime.audio.startRecording(value.limits.maxRecordingSeconds);
      if (
        attempt !== voiceStartAttemptRef.current ||
        !isOperationCurrent(operation)
      ) {
        await context.runtime.audio.cancelRecording().catch(() => undefined);
        return;
      }
      recordingStartedAtRef.current = Date.now();
      setRecording(true);
      setRecordingNotice(null);
      renewDraftIdentity();
    } catch (cause) {
      if (attempt === voiceStartAttemptRef.current && isOperationCurrent(operation)) {
        recordingOwnerRef.current = null;
        setRecording(false);
        setRecordingNotice(null);
        setError(composerError(cause, "Voice recording could not start."));
      }
    } finally {
      if (attempt === voiceStartAttemptRef.current) {
        voiceStartLockedRef.current = false;
        if (isOperationCurrent(operation)) setRecordingStarting(false);
      }
    }
  }, [
    accessRevoked,
    captureOperation,
    context.runtime.audio,
    isOperationCurrent,
    policy.data,
    recording,
    renewDraftIdentity,
    selectingSource,
    uploading
  ]);

  const stopVoice = useCallback(async () => {
    const operation = recordingOwnerRef.current;
    if (!operation || !isOperationCurrent(operation) || pendingRef.current || voiceStopLockedRef.current) return;
    voiceStopLockedRef.current = true;
    setRecordingStopping(true);
    setRecordingNotice("Preparing voice note…");
    try {
      await context.runtime.audio.stopRecording();
    } catch (cause) {
      if (isOperationCurrent(operation)) {
        recordingOwnerRef.current = null;
        recordingStartedAtRef.current = null;
        setRecording(false);
        setRecordingStopping(false);
        setRecordingElapsedSeconds(0);
        setRecordingNotice(null);
        if (!(cause instanceof AudioRecordingInterruptedError)) {
          setError(composerError(cause, "The voice note could not be completed."));
        }
      }
    } finally {
      voiceStopLockedRef.current = false;
    }
  }, [context.runtime.audio, isOperationCurrent]);

  const cancelVoice = useCallback(async () => {
    if (pendingRef.current) return;
    const operation = recordingOwnerRef.current;
    voiceStartAttemptRef.current += 1;
    voiceStartLockedRef.current = false;
    voiceStopLockedRef.current = false;
    recordingOwnerRef.current = null;
    recordingStartedAtRef.current = null;
    try {
      await context.runtime.audio.cancelRecording();
    } catch (cause) {
      if (!operation || isOperationCurrent(operation)) {
        setError(composerError(cause, "The voice note could not be cancelled."));
      }
    } finally {
      if (!operation || isOperationCurrent(operation)) {
        setRecording(false);
        setRecordingStarting(false);
        setRecordingStopping(false);
        setRecordingElapsedSeconds(0);
        setRecordingNotice(null);
        renewDraftIdentity();
      }
    }
  }, [context.runtime.audio, isOperationCurrent, renewDraftIdentity]);

  const cancelReply = useCallback(() => {
    if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
    renewDraftIdentity();
    onCancelReply();
  }, [onCancelReply, renewDraftIdentity]);

  const clearPriority = useCallback(() => {
    if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
    setPriority("normal");
    renewDraftIdentity();
  }, [renewDraftIdentity]);

  const submit = useCallback(() => {
    if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
    const replyToId = reply?.id ?? null;
    if (sendSnapshot.current && sendSnapshot.current.replyToId !== replyToId) {
      clientMessageId.current = createClientMessageId();
      sendSnapshot.current = null;
    }
    const snapshot = sendSnapshot.current ?? Object.freeze({
      body: body.trim(),
      ...(staged.length
        ? { attachmentIds: Object.freeze(staged.map((item) => item.attachment.id)) }
        : {}),
      mentions: Object.freeze([]),
      priority,
      replyToId,
      responsibleUserId: null,
      clientMessageId: clientMessageId.current
    });
    sendSnapshot.current = snapshot;
    const operation = captureOperation();
    pendingRef.current = true;
    setAttachmentOpen(false);
    setPriorityOpen(false);
    send.mutate({ operation, payload: snapshot });
  }, [body, captureOperation, priority, reply?.id, send, staged]);

  useImperativeHandle(ref, () => ({
    hasTransientState() {
      return pendingRef.current || send.isPending || removingStagedCount > 0 || attachmentOpen || priorityOpen || recordingStarting || recording || recordingStopping || Boolean(selectingSource) || uploading || Boolean(selectedAsset) || staged.length > 0 || Boolean(reply) || priority !== "normal";
    },
    dismissTransientState() {
      if (pendingRef.current || send.isPending) return true;
      if (removingStagedCount > 0 || stagedRemovalsRef.current.size > 0) return true;
      if (attachmentOpen) {
        setAttachmentOpen(false);
        return true;
      }
      if (priorityOpen) {
        setPriorityOpen(false);
        return true;
      }
      if (recordingStarting || recording || recordingStopping) {
        void cancelVoice();
        return true;
      }
      if (selectingSource || selectionOperationRef.current) return true;
      if (uploading || selectedAsset) {
        void clearSelected();
        return true;
      }
      if (reply) {
        cancelReply();
        return true;
      }
      if (staged.length) {
        for (const item of staged) void removeStaged(item);
        return true;
      }
      if (priority !== "normal") {
        clearPriority();
        return true;
      }
      return false;
    }
  }), [attachmentOpen, cancelReply, cancelVoice, clearPriority, priority, priorityOpen, recording, recordingStarting, recordingStopping, removingStagedCount, reply, selectedAsset, selectingSource, send.isPending, staged, uploading]);

  const submitEnabled = canSubmitChatMessage({
    body,
    stagedCount: staged.length,
    pending: send.isPending || removingStagedCount > 0,
    uploading: uploading || Boolean(selectingSource) || Boolean(selectedAsset),
    recording: recordingStarting || recording || recordingStopping
  });
  const mediaEnabled = Boolean(policy.data?.enabled);
  const stagedBytes = staged.reduce((total, item) => total + item.attachment.byteSize, 0);
  const attachmentLimitReached = Boolean(
    policy.data && staged.length >= policy.data.limits.maxAttachments
  );
  const aggregateLimitReached = Boolean(
    policy.data && stagedBytes >= policy.data.limits.maxMessageBytes
  );
  const interactionLocked = send.isPending || removingStagedCount > 0;
  const mediaLocked = interactionLocked || accessRevoked || uploading || Boolean(selectingSource) || recordingStarting || recording || recordingStopping;
  const canOpenAttachment = Boolean(
    policy.data?.enabled &&
    policy.data.capabilities.canUpload &&
    allMimeTypes.length &&
    !selectedAsset &&
    !attachmentLimitReached &&
    !aggregateLimitReached &&
    !mediaLocked
  );
  const showVoice = recordingStarting || recording || recordingStopping || Boolean(
    !body.trim() &&
    !staged.length &&
    !selectedAsset &&
    !uploading &&
    !selectingSource &&
    !removingStagedCount &&
    policy.data?.enabled &&
    policy.data.capabilities.canRecord
  );
  const limitNotice = attachmentLimitReached && policy.data
    ? `A message can include up to ${policy.data.limits.maxAttachments} attachments.`
    : aggregateLimitReached && policy.data
      ? `Attachments must stay within ${formatBytes(policy.data.limits.maxMessageBytes)} per message.`
      : null;
  const trayError = error ?? limitNotice ?? (policy.isError
    ? "Media sharing is unavailable. Text messages can still be sent."
    : null);

  return (
    <View style={styles.shell}>
      <AttachmentOptionsSheet
        visible={attachmentOpen}
        compact={compact}
        disabled={interactionLocked || accessRevoked}
        busy={Boolean(selectingSource)}
        busySource={selectingSource}
        photoAvailable={imageMimeTypes.length > 0}
        cameraAvailable={imageMimeTypes.length > 0}
        fileAvailable={allMimeTypes.length > 0}
        onRequestClose={closeAttachmentOptions}
        onChoosePhoto={() => void chooseSource("photo")}
        onTakePhoto={() => void chooseSource("camera")}
        onChooseFile={() => void chooseSource("file")}
        onRestoreFocus={restorePaperclipFocus}
      />
      <ComposerTray
        reply={reply}
        priority={priority}
        selectedAsset={selectedAsset}
        selectedIsVoiceNote={selectedIsVoiceNote}
        staged={staged}
        uploading={uploading}
        uploadProgress={uploadProgress}
        recordingStarting={recordingStarting}
        recording={recording}
        recordingElapsedSeconds={recordingElapsedSeconds}
        recordingNotice={recordingNotice}
        error={trayError}
        showCameraSettings={error === CAMERA_SETTINGS_ERROR}
        showMediaRetry={policy.isError && !isAccessDenied(policy.error)}
        disabled={interactionLocked}
        onCancelReply={cancelReply}
        onCancelRecording={() => void cancelVoice()}
        onClearPriority={clearPriority}
        onOpenCameraSettings={() => {
          void Linking.openSettings().catch(() => {
            setError("Android Settings could not be opened. Open Lisno permissions from device settings.");
          });
        }}
        onRetryMedia={() => void policy.refetch()}
        onRemoveSelected={() => void clearSelected()}
        onRetryUpload={() => selectedAsset
          ? void uploadAsset(selectedAsset, { voiceNote: selectedIsVoiceNote })
          : undefined}
        onRemoveStaged={(item) => void removeStaged(item)}
      />
      <View style={styles.composer}>
        {policy.data?.capabilities.canUpload ? (
          <Pressable
            accessibilityLabel="Open attachment options"
            accessibilityRole="button"
            accessibilityState={{
              disabled: !canOpenAttachment,
              expanded: attachmentOpen
            }}
            disabled={!canOpenAttachment}
            onPress={() => {
              if (!canOpenAttachment || stagedRemovalsRef.current.size > 0) return;
              setPriorityOpen(false);
              setAttachmentOpen(true);
            }}
            ref={paperclipRef}
            style={({ pressed }) => [
              styles.toolButton,
              !canOpenAttachment ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <ChatIcon name="attach" size={24} />
          </Pressable>
        ) : <View style={styles.toolSpacer} />}
        <View style={styles.inputShell}>
          <Pressable
            accessibilityLabel="Open device emoji keyboard"
            accessibilityRole="button"
            accessibilityState={{ disabled: interactionLocked }}
            disabled={interactionLocked}
            onPress={() => {
              if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
              setAttachmentOpen(false);
              setPriorityOpen(false);
              const caret = selectionRef.current;
              requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.setNativeProps({ selection: caret });
              });
            }}
            style={({ pressed }) => [styles.inputTool, pressed ? styles.pressed : null]}
          >
            <ChatIcon name="smile" size={22} />
          </Pressable>
          <TextInput
            accessibilityLabel="Message the project team"
            editable={!interactionLocked}
            maxLength={4000}
            multiline
            onSelectionChange={(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
              selectionRef.current = event.nativeEvent.selection;
            }}
            onChangeText={(value) => {
              if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
              setBody(value);
              renewDraftIdentity();
            }}
            placeholder="Type a message"
            placeholderTextColor="#849198"
            ref={inputRef}
            style={styles.input}
            value={body}
          />
          <Pressable
            accessibilityLabel="Message importance"
            accessibilityRole="button"
            accessibilityState={{ disabled: interactionLocked, selected: priority !== "normal" }}
            disabled={interactionLocked}
            onPress={() => {
              if (!pendingRef.current && stagedRemovalsRef.current.size === 0) {
                setAttachmentOpen(false);
                setPriorityOpen(true);
              }
            }}
            style={({ pressed }) => [styles.importance, pressed ? styles.pressed : null]}
          >
            <ChatIcon color={priority !== "normal" ? chatColors.green : chatColors.muted} name="flag" size={21} />
          </Pressable>
        </View>
        {showVoice ? (
          <Pressable
            accessibilityLabel={recording || recordingStopping
              ? "Stop voice note"
              : recordingStarting
                ? "Requesting microphone"
                : "Record voice note"}
            accessibilityRole="button"
            accessibilityState={{
              busy: recordingStarting || recordingStopping,
              disabled: interactionLocked || recordingStarting || recordingStopping
            }}
            disabled={interactionLocked || recordingStarting || recordingStopping}
            onPress={() => void (recording ? stopVoice() : startVoice())}
            style={({ pressed }) => [
              styles.sendButton,
              recording || recordingStopping ? styles.recordingButton : null,
              interactionLocked || recordingStarting || recordingStopping ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            {recording || recordingStopping
              ? <ChatIcon color="#FFFFFF" name="stop" size={22} />
              : <ChatIcon color="#FFFFFF" name="mic" size={22} />}
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={send.isError ? "Retry sending message" : "Send message"}
            accessibilityRole="button"
            accessibilityState={{ disabled: !submitEnabled, busy: send.isPending }}
            disabled={!submitEnabled}
            onPress={submit}
            style={({ pressed }) => [styles.sendButton, !submitEnabled ? styles.disabled : null, pressed ? styles.pressed : null]}
          >
            <ChatIcon color="#FFFFFF" name="send" size={22} />
          </Pressable>
        )}
      </View>
      <Text style={styles.audience}>Shared with the client and project team</Text>
      {!mediaEnabled && !policy.isPending && !policy.isError ? <Text style={styles.mediaUnavailable}>Media sharing is unavailable in this conversation.</Text> : null}
      <Modal animationType="fade" onRequestClose={() => interactionLocked ? undefined : setPriorityOpen(false)} transparent visible={priorityOpen}>
        <View style={styles.priorityOverlay}>
          <Pressable accessibilityLabel="Close message importance" accessibilityRole="button" accessibilityState={{ disabled: interactionLocked }} disabled={interactionLocked} onPress={() => setPriorityOpen(false)} style={styles.priorityBackdrop} />
          <View accessibilityViewIsModal style={styles.prioritySheet}>
            <Text accessibilityRole="header" style={styles.priorityTitle}>Message importance</Text>
            <View accessibilityRole="radiogroup" style={styles.priorityOptions}>
              {(["normal", "important", "critical"] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ disabled: interactionLocked, selected: priority === value }}
                  disabled={interactionLocked}
                  onPress={() => {
                    if (pendingRef.current || stagedRemovalsRef.current.size > 0) return;
                    setPriority(value);
                    setPriorityOpen(false);
                    renewDraftIdentity();
                  }}
                  style={[styles.priorityOption, priority === value ? styles.priorityOptionSelected : null]}
                >
                  <Text style={[styles.priorityOptionText, priority === value ? styles.priorityOptionTextSelected : null]}>{value}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: chatColors.border, backgroundColor: chatColors.header, paddingBottom: 2 },
  composer: { minHeight: 62, flexDirection: "row", alignItems: "flex-end", gap: 4, paddingHorizontal: 5, paddingTop: 7 },
  toolButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  toolSpacer: { width: 4 },
  inputShell: { minHeight: 48, maxHeight: 136, flex: 1, flexDirection: "row", alignItems: "flex-end", borderRadius: 24, backgroundColor: colors.surface, paddingLeft: 0 },
  inputTool: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 48, maxHeight: 132, flex: 1, color: chatColors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, paddingTop: 13, paddingBottom: 11, paddingHorizontal: 2, textAlignVertical: "top" },
  importance: { width: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  sendButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, backgroundColor: chatColors.green },
  recordingButton: { backgroundColor: colors.danger },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76 },
  audience: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 9, lineHeight: 14, textAlign: "center", paddingBottom: 2 },
  mediaUnavailable: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 9, paddingHorizontal: spacing.md, paddingBottom: 2, textAlign: "center" },
  priorityOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  priorityBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(20,16,42,0.42)" },
  prioritySheet: { width: "100%", maxWidth: 380, borderRadius: radii.surface, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  priorityTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18 },
  priorityOptions: { gap: spacing.xs },
  priorityOption: { minHeight: 50, justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, paddingHorizontal: spacing.md },
  priorityOptionSelected: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  priorityOptionText: { color: colors.ink, fontFamily: fonts.medium, fontSize: 14, textTransform: "capitalize" },
  priorityOptionTextSelected: { color: colors.surface }
});
