import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  findNodeHandle,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent
} from "react-native";

import { TransferHttpError, type CancellableTransfer, type DownloadedArtifact } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import {
  messageAccessibilitySummary,
  type PresentedAttachment,
  type PresentedMessageTimelineItem
} from "./chatModel";
import { chatColors } from "./chatTheme";
import { ChatImageViewer } from "./ChatImageViewer";
import { ChatIcon } from "./ChatIcon";
import {
  SWIPE_REPLY_COMMIT_DISTANCE,
  clampSwipeReplyTranslation,
  isSwipeReplyIntent,
  shouldCommitSwipeReply
} from "./swipeReply";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof TransferHttpError || error instanceof Error
    ? error.message
    : "The attachment could not be opened.";
}

function isAudioAttachment(attachment: PresentedAttachment): boolean {
  return attachment.kind === "audio" || attachment.mimeType.startsWith("audio/");
}

function isImageAttachment(attachment: PresentedAttachment): boolean {
  return attachment.kind === "image" || attachment.mimeType.startsWith("image/");
}

function authorInitials(author: string): string {
  const names = author.trim().split(/\s+/u).filter(Boolean);
  if (!names.length) return "L";
  const first = names[0]?.slice(0, 1) ?? "";
  const last = names.length > 1 ? names[names.length - 1]?.slice(0, 1) ?? "" : "";
  return `${first}${last}`.toLocaleUpperCase();
}

function MessageAttachment({
  attachment,
  projectId,
  author,
  compactImageFooter,
  onDenied
}: {
  readonly attachment: PresentedAttachment;
  readonly projectId: string;
  readonly author: string;
  readonly compactImageFooter: boolean;
  readonly onDenied: () => void;
}) {
  const context = useConfiguredRuntime();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const original = useRef<DownloadedArtifact | null>(null);
  const originalTransfer = useRef<CancellableTransfer<DownloadedArtifact> | null>(null);
  const originalLoad = useRef<Promise<DownloadedArtifact> | null>(null);
  const preview = useRef<DownloadedArtifact | null>(null);
  const mounted = useRef(true);
  const viewerVisible = useRef(false);
  const viewerGeneration = useRef(0);
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;
  const playbackOwnerId = `chat:${projectId}:${attachment.id}`;
  const audio = isAudioAttachment(attachment);
  const image = isImageAttachment(attachment);

  useEffect(() => {
    if (!image || !attachment.preview) return;
    let active = true;
    const transfer = context.runtime.transfers.download({
      path: `/projects/${encodeURIComponent(projectId)}/chat/attachments/${encodeURIComponent(attachment.id)}/preview`,
      fileName: `preview-${attachment.filename}`,
      mimeType: attachment.preview.mimeType,
      maxBytes: Math.max(attachment.preview.byteSize, 1) + 1024
    });
    void transfer.result.then((artifact) => {
      if (!active) {
        void artifact.release();
        return;
      }
      preview.current = artifact;
      setPreviewUri(artifact.uri);
    }).catch((cause) => {
      if (!active) return;
      if (cause instanceof TransferHttpError && [401, 403, 404].includes(cause.status)) onDeniedRef.current();
      else setError("Image preview unavailable");
    });
    return () => {
      active = false;
      transfer.cancel();
      if (preview.current) void preview.current.release();
      preview.current = null;
    };
  }, [attachment.filename, attachment.id, attachment.preview, context.runtime.transfers, image, projectId]);

  useEffect(() => {
    if (viewerVisible.current && previewUri && !viewerUri) setViewerUri(previewUri);
  }, [previewUri, viewerUri]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      viewerVisible.current = false;
      viewerGeneration.current += 1;
      originalTransfer.current?.cancel();
      originalTransfer.current = null;
      if (audio) context.runtime.audio.stopPlayback(playbackOwnerId);
      if (original.current) void original.current.release();
      original.current = null;
    };
  }, [audio, context.runtime.audio, playbackOwnerId]);

  useEffect(() => {
    if (!audio) return;
    return context.runtime.audio.subscribePlaybackEvents((event) => {
      if (event.ownerId !== playbackOwnerId) return;
      setPlaying(event.type === "playing");
    });
  }, [audio, context.runtime.audio, playbackOwnerId]);

  const loadOriginal = (): Promise<DownloadedArtifact> => {
    if (original.current) return Promise.resolve(original.current);
    if (originalLoad.current) return originalLoad.current;
    const transfer = context.runtime.transfers.download({
      path: `/projects/${encodeURIComponent(projectId)}/chat/attachments/${encodeURIComponent(attachment.id)}/content`,
      fileName: attachment.filename,
      mimeType: attachment.mimeType,
      maxBytes: Math.max(attachment.byteSize, 1) + 1024
    });
    originalTransfer.current = transfer;
    const pending = transfer.result.then(async (artifact) => {
      if (!mounted.current) {
        await artifact.release();
        throw new Error("The attachment was closed.");
      }
      original.current = artifact;
      return artifact;
    }).finally(() => {
      if (originalTransfer.current === transfer) originalTransfer.current = null;
      if (originalLoad.current === pending) originalLoad.current = null;
    });
    originalLoad.current = pending;
    return pending;
  };

  const closeImageViewer = () => {
    viewerVisible.current = false;
    viewerGeneration.current += 1;
    setViewerOpen(false);
    setViewerLoading(false);
    setViewerError(null);
    setViewerUri(null);
    originalTransfer.current?.cancel();
    originalTransfer.current = null;
    const artifact = original.current;
    original.current = null;
    if (artifact) void artifact.release();
  };

  const loadImageForViewer = async () => {
    const generation = ++viewerGeneration.current;
    setViewerLoading(true);
    setViewerError(null);
    try {
      const artifact = await loadOriginal();
      if (!mounted.current || !viewerVisible.current || generation !== viewerGeneration.current) {
        if (original.current === artifact) original.current = null;
        await artifact.release();
        return;
      }
      setViewerUri(artifact.uri);
    } catch (cause) {
      if (!mounted.current || !viewerVisible.current || generation !== viewerGeneration.current) return;
      if (cause instanceof TransferHttpError && [401, 403, 404].includes(cause.status)) {
        closeImageViewer();
        onDeniedRef.current();
        return;
      }
      setViewerError("The full image could not be loaded.");
    } finally {
      if (mounted.current && viewerVisible.current && generation === viewerGeneration.current) {
        setViewerLoading(false);
      }
    }
  };

  const showImage = (event: GestureResponderEvent) => {
    event.stopPropagation();
    viewerVisible.current = true;
    setViewerOpen(true);
    setViewerUri(previewUri);
    setViewerError(null);
    setError(null);
    void loadImageForViewer();
  };

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const artifact = await loadOriginal();
      await artifact.share({ cleanupAfterShare: false });
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof TransferHttpError && [401, 403, 404].includes(cause.status)) {
        onDeniedRef.current();
        return;
      }
      setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const toggleAudio = async () => {
    if (busy) return;
    if (playing) {
      context.runtime.audio.pause(playbackOwnerId);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const artifact = await loadOriginal();
      await context.runtime.audio.play(artifact.uri, playbackOwnerId);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof TransferHttpError && [401, 403, 404].includes(cause.status)) {
        onDeniedRef.current();
        return;
      }
      setError(errorMessage(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (audio) {
    const controlLabel = `${busy ? "Loading" : playing ? "Pause" : "Play"} ${attachment.filename}`;
    return (
      <View accessibilityLabel={`Audio: ${attachment.filename}`} accessibilityRole="summary" style={styles.audioAttachment} testID={`audio-attachment-${attachment.id}`}>
        <View style={styles.audioMediaRow} testID={`audio-media-row-${attachment.id}`}>
          <Pressable
            accessibilityHint="Downloads securely when needed, then plays the voice note"
            accessibilityLabel={controlLabel}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => void toggleAudio()}
            style={({ pressed }) => [styles.audioControl, pressed ? styles.pressed : null]}
          >
            {busy ? (
              <ActivityIndicator color={chatColors.greenStrong} size="small" />
            ) : (
              <View style={[styles.audioControlWell, playing ? styles.audioControlWellPlaying : null]}>
                <Text allowFontScaling={false} style={styles.audioControlGlyph}>{playing ? "Ⅱ" : "▶"}</Text>
              </View>
            )}
          </Pressable>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.audioTrack}
            testID={`audio-track-${attachment.id}`}
          >
            <View style={[styles.audioTrackRail, playing ? styles.audioTrackRailPlaying : null]} />
            <View style={[styles.audioTrackDot, styles.audioTrackDotFirst, playing ? styles.audioTrackDotPlaying : null]} />
            <View style={[styles.audioTrackDot, styles.audioTrackDotMiddle, playing ? styles.audioTrackDotPlaying : null]} />
            <View style={[styles.audioTrackDot, styles.audioTrackDotLast, playing ? styles.audioTrackDotPlaying : null]} />
          </View>
          <View style={styles.audioAvatar} testID={`audio-avatar-${attachment.id}`}>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.audioAvatarText}>{authorInitials(author)}</Text>
            <View style={styles.audioMic}><ChatIcon color={chatColors.green} name="mic" size={10} /></View>
          </View>
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <>
      <View style={[styles.attachment, image ? styles.imageAttachment : null]}>
        {image ? (
          <Pressable
            accessibilityHint="Opens a full-screen image viewer"
            accessibilityLabel={`View image ${attachment.filename}`}
            accessibilityRole="button"
            onPress={showImage}
            style={styles.imagePreview}
          >
            {previewUri ? <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{ uri: previewUri }} style={styles.image} /> : <View style={styles.imageFallback}><Text style={styles.imageFallbackText}>Photo</Text></View>}
          </Pressable>
        ) : null}
        <View
          accessible
          style={[
            styles.attachmentCopy,
            image ? styles.imageAttachmentCopy : null,
            image && compactImageFooter ? styles.imageAttachmentCopyWithTime : null
          ]}
        >
          <Text numberOfLines={2} style={styles.attachmentName}>{attachment.filename}</Text>
          <Text style={styles.attachmentMeta}>{attachment.kind} · {formatBytes(attachment.byteSize)}</Text>
        </View>
        {!image ? (
          <Pressable
            accessibilityLabel={`Open attachment ${attachment.filename}`}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            disabled={busy}
            hitSlop={6}
            onPress={() => void open()}
            style={({ pressed }) => [styles.openAttachment, pressed ? styles.pressed : null]}
          >
            {busy ? <ActivityIndicator color={colors.violet} size="small" /> : <Text style={styles.openAttachmentText}>Open</Text>}
          </Pressable>
        ) : null}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      </View>
      {image ? (
        <ChatImageViewer
          error={viewerError}
          filename={attachment.filename}
          loading={viewerLoading}
          localUri={viewerUri}
          onClose={closeImageViewer}
          onRetry={() => void loadImageForViewer()}
          visible={viewerOpen}
        />
      ) : null}
    </>
  );
}

function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
}

function roleLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toLocaleUpperCase());
}

export function MessageBubble({
  item,
  compact,
  onOpenActions,
  onDenied,
  onReply,
  reducedMotion = false
}: {
  readonly item: PresentedMessageTimelineItem;
  readonly compact: boolean;
  readonly onOpenActions: (originHandle: number | null) => void;
  readonly onDenied: () => void;
  readonly onReply?: (() => void) | undefined;
  readonly reducedMotion?: boolean | undefined;
}) {
  const summary = useRef<Text>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const leftIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const rightIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const onReplyRef = useRef(onReply);
  const replyEnabledRef = useRef(Boolean(onReply));
  const reducedMotionRef = useRef(reducedMotion);
  const replyDispatched = useRef(false);
  const { message, own } = item;
  onReplyRef.current = onReply;
  replyEnabledRef.current = Boolean(onReply);
  reducedMotionRef.current = reducedMotion;
  const timestamp = timeLabel(message.createdAt);
  const summaryLabel = messageAccessibilitySummary(message, timestamp || message.createdAt);
  const priorityLabel = message.priority === "critical" ? "Critical" : "Important";
  const audioOnly = message.attachments.length > 0 && message.attachments.every(isAudioAttachment);
  const imageOnly = message.attachments.length > 0 && message.attachments.every(isImageAttachment);
  const audioNeedsMoreRoom = audioOnly && Boolean(
    message.body || message.replyTo || message.priority !== "normal" || message.issueStatus
  );
  const usesInlineTextTime = Boolean(message.body) &&
    message.attachments.length === 0 &&
    !message.replyTo &&
    message.priority === "normal" &&
    !message.issueStatus;
  const usesInlineAudioTime = audioOnly &&
    !message.body &&
    !message.replyTo &&
    message.priority === "normal" &&
    !message.issueStatus;
  const usesInlineImageTime = imageOnly &&
    !message.body &&
    !message.replyTo &&
    message.priority === "normal" &&
    !message.issueStatus;
  const openActions = () => onOpenActions(findNodeHandle(summary.current));
  const replyEnabled = Boolean(onReply);

  const resetGestureImmediately = () => {
    translateX.stopAnimation();
    leftIndicatorOpacity.stopAnimation();
    rightIndicatorOpacity.stopAnimation();
    translateX.setValue(0);
    leftIndicatorOpacity.setValue(0);
    rightIndicatorOpacity.setValue(0);
  };
  const settleGesture = () => {
    translateX.stopAnimation();
    leftIndicatorOpacity.stopAnimation();
    rightIndicatorOpacity.stopAnimation();
    if (reducedMotionRef.current) {
      resetGestureImmediately();
      return;
    }
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        speed: 24,
        bounciness: 0,
        useNativeDriver: true
      }),
      Animated.timing(leftIndicatorOpacity, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true
      }),
      Animated.timing(rightIndicatorOpacity, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true
      })
    ]).start();
  };
  const resetGestureRef = useRef(resetGestureImmediately);
  const settleGestureRef = useRef(settleGesture);
  resetGestureRef.current = resetGestureImmediately;
  settleGestureRef.current = settleGesture;

  const swipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      replyEnabledRef.current && isSwipeReplyIntent({ deltaX: gesture.dx, deltaY: gesture.dy }),
    onMoveShouldSetPanResponderCapture: (_event, gesture) =>
      replyEnabledRef.current && isSwipeReplyIntent({ deltaX: gesture.dx, deltaY: gesture.dy }),
    onPanResponderGrant: () => {
      translateX.stopAnimation();
      leftIndicatorOpacity.stopAnimation();
      rightIndicatorOpacity.stopAnimation();
      replyDispatched.current = false;
    },
    onPanResponderMove: (_event, gesture) => {
      if (!replyEnabledRef.current) {
        resetGestureRef.current();
        return;
      }
      const clamped = clampSwipeReplyTranslation(gesture.dx);
      const progress = Math.min(Math.abs(clamped) / SWIPE_REPLY_COMMIT_DISTANCE, 1);
      translateX.setValue(clamped);
      leftIndicatorOpacity.setValue(clamped > 0 ? progress : 0);
      rightIndicatorOpacity.setValue(clamped < 0 ? progress : 0);
    },
    onPanResponderRelease: (_event, gesture) => {
      const reply = onReplyRef.current;
      const commit = Boolean(reply) && !replyDispatched.current && shouldCommitSwipeReply({
        deltaX: gesture.dx,
        deltaY: gesture.dy,
        velocityX: gesture.vx,
        velocityY: gesture.vy,
        endState: "released"
      });
      if (commit && reply) {
        replyDispatched.current = true;
        reply();
      }
      settleGestureRef.current();
    },
    onPanResponderTerminate: () => {
      resetGestureRef.current();
    },
    onPanResponderReject: () => {
      resetGestureRef.current();
    },
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false
  }), [leftIndicatorOpacity, rightIndicatorOpacity, translateX]);

  useEffect(() => {
    replyDispatched.current = false;
    resetGestureRef.current();
    return () => resetGestureRef.current();
  }, [message.id, reducedMotion, replyEnabled]);

  const accessibilityActions = replyEnabled
    ? [
        { name: "reply", label: "Reply" },
        { name: "messageActions", label: "Message actions" }
      ]
    : [{ name: "messageActions", label: "Message actions" }];
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "reply" && onReplyRef.current) {
      onReplyRef.current();
      return;
    }
    if (event.nativeEvent.actionName === "messageActions") openActions();
  };
  const bubbleLayout = [
    styles.gestureSurface,
    compact ? styles.compactBubble : styles.expandedBubble,
    message.attachments.length
      ? audioOnly
        ? (compact ? styles.compactAudioBubble : styles.expandedAudioBubble)
        : (compact ? styles.compactAttachmentBubble : styles.expandedAttachmentBubble)
      : null,
    audioNeedsMoreRoom
      ? (compact ? styles.compactDetailedAudioBubble : styles.expandedDetailedAudioBubble)
      : null
  ];

  return (
    <View
      style={[styles.row, own ? styles.ownRow : styles.incomingRow, item.startsGroup ? styles.groupStart : null]}
      testID={`message-row-${message.id}`}
    >
      <View
        {...(replyEnabled ? swipeResponder.panHandlers : {})}
        style={bubbleLayout}
        testID={`message-swipe-${message.id}`}
      >
        {replyEnabled ? (
          <>
            <Animated.View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[styles.replyIndicator, styles.leftReplyIndicator, { opacity: leftIndicatorOpacity }]}
              testID={`reply-indicator-left-${message.id}`}
            >
              <Text allowFontScaling={false} style={styles.replyIndicatorGlyph}>↩</Text>
            </Animated.View>
            <Animated.View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[styles.replyIndicator, styles.rightReplyIndicator, { opacity: rightIndicatorOpacity }]}
              testID={`reply-indicator-right-${message.id}`}
            >
              <Text allowFontScaling={false} style={styles.replyIndicatorGlyph}>↩</Text>
            </Animated.View>
          </>
        ) : null}
        <Animated.View
          style={[
            message.attachments.length ? styles.filledGestureContent : null,
            { transform: [{ translateX }] }
          ]}
          testID={`message-translation-${message.id}`}
        >
          <Pressable
            accessible={false}
            delayLongPress={350}
            onLongPress={openActions}
            onPress={openActions}
            testID={`message-bubble-${message.id}`}
            style={({ pressed }) => [
              styles.bubble,
              message.attachments.length ? styles.filledBubble : null,
              imageOnly ? styles.imageBubble : null,
              own ? styles.ownBubble : styles.incomingBubble,
              pressed ? styles.pressed : null
            ]}
          >
        {item.startsGroup ? <View style={own ? styles.ownTail : styles.incomingTail} /> : null}
        {item.showAuthor ? (
          <View style={styles.authorLine}>
            <Text style={styles.author}>{message.author}</Text>
            <Text style={styles.authorRole}>{roleLabel(message.authorRole)}</Text>
          </View>
        ) : null}
        {message.replyTo ? (
          <View style={[styles.reply, own ? styles.ownReply : null]}>
            <Text style={styles.replyAuthor}>{message.replyTo.author}</Text>
            <Text numberOfLines={2} style={styles.replyBody}>
              {message.replyTo.body || message.replyTo.attachmentSummary?.filename || "Attachment"}
            </Text>
          </View>
        ) : null}
        {message.body ? (
          <Text selectable style={styles.body}>
            {message.body}
            {usesInlineTextTime ? <Text style={styles.inlineTimeReserve}>{"\u00A0".repeat(14)}</Text> : null}
          </Text>
        ) : null}
        {message.attachments.map((attachment) => (
          <MessageAttachment
            key={attachment.id}
            attachment={attachment}
            author={message.author}
            compactImageFooter={usesInlineImageTime}
            projectId={message.projectId}
            onDenied={onDenied}
          />
        ))}
        {usesInlineTextTime || usesInlineAudioTime || usesInlineImageTime ? (
          <Text
            ref={summary}
            accessibilityActions={accessibilityActions}
            accessibilityHint={replyEnabled ? "Actions available: Reply and Message actions" : "Action available: Message actions"}
            accessibilityLabel={summaryLabel}
            accessibilityRole="summary"
            onAccessibilityAction={onAccessibilityAction}
            style={[
              styles.time,
              usesInlineAudioTime
                ? styles.inlineAudioTime
                : usesInlineImageTime
                  ? styles.inlineImageTime
                  : styles.inlineTextTime
            ]}
          >
            {timestamp}{own ? "  ✓" : ""}
          </Text>
        ) : (
          <View style={styles.footer}>
            {message.priority !== "normal" ? (
              <View style={[
                styles.priority,
                message.priority === "critical" ? styles.critical : styles.important,
                message.issueStatus === "resolved" ? styles.resolved : null
              ]}>
                <Text style={[
                  styles.priorityText,
                  message.priority === "critical" ? styles.criticalText : null
                ]}>
                  {priorityLabel}{message.issueStatus ? ` · ${message.issueStatus}` : ""}
                </Text>
              </View>
            ) : <View style={styles.footerSpacer} />}
            <Text
              ref={summary}
              accessibilityActions={accessibilityActions}
              accessibilityHint={replyEnabled ? "Actions available: Reply and Message actions" : "Action available: Message actions"}
              accessibilityLabel={summaryLabel}
              accessibilityRole="summary"
              onAccessibilityAction={onAccessibilityAction}
              style={styles.time}
            >
              {timestamp}{own ? "  ✓" : ""}
            </Text>
          </View>
        )}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: "100%", marginTop: 2, paddingHorizontal: 8 },
  incomingRow: { alignItems: "flex-start" },
  ownRow: { alignItems: "flex-end" },
  groupStart: { marginTop: 8 },
  gestureSurface: { flexShrink: 1, position: "relative" },
  filledGestureContent: { width: "100%" },
  filledBubble: { width: "100%" },
  bubble: {
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 4,
    borderRadius: 8,
    gap: 3,
    shadowColor: "#0B141A",
    shadowOpacity: 0.14,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  compactBubble: { maxWidth: "89%" },
  expandedBubble: { maxWidth: "74%" },
  compactAttachmentBubble: { width: "86%" },
  expandedAttachmentBubble: { width: "58%", minWidth: 280 },
  compactAudioBubble: { width: 248, maxWidth: "89%" },
  expandedAudioBubble: { width: 260, maxWidth: "68%" },
  compactDetailedAudioBubble: { width: "89%" },
  expandedDetailedAudioBubble: { width: "68%" },
  imageBubble: { paddingHorizontal: 4 },
  incomingBubble: { backgroundColor: colors.surface, borderTopLeftRadius: 0 },
  ownBubble: { backgroundColor: chatColors.outgoing, borderTopRightRadius: 0 },
  incomingTail: { position: "absolute", top: 0, left: -7, width: 0, height: 0, borderTopWidth: 8, borderLeftWidth: 8, borderTopColor: colors.surface, borderLeftColor: "transparent" },
  ownTail: { position: "absolute", top: 0, right: -7, width: 0, height: 0, borderTopWidth: 8, borderRightWidth: 8, borderTopColor: chatColors.outgoing, borderRightColor: "transparent" },
  pressed: { opacity: 0.78 },
  authorLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 7 },
  author: { color: chatColors.greenStrong, fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  authorRole: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 15 },
  body: { color: chatColors.ink, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  inlineTimeReserve: { fontSize: 14, lineHeight: 20 },
  reply: {
    borderLeftWidth: 3,
    borderLeftColor: chatColors.green,
    borderRadius: 4,
    backgroundColor: "rgba(11,20,26,0.05)",
    paddingHorizontal: spacing.xs,
    paddingVertical: 6
  },
  ownReply: { backgroundColor: "rgba(255,255,255,0.7)" },
  replyAuthor: { color: chatColors.green, fontFamily: fonts.semibold, fontSize: 11 },
  replyBody: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  attachment: {
    minHeight: 52,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.control,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingLeft: spacing.sm,
    overflow: "hidden"
  },
  imageAttachment: { minHeight: 0, flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch", gap: 0, paddingLeft: 0 },
  imagePreview: { width: "100%", height: 184, alignItems: "center", justifyContent: "center", backgroundColor: chatColors.header },
  image: { width: "100%", height: "100%" },
  imageFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  imageFallbackText: { color: chatColors.muted, fontFamily: fonts.medium, fontSize: 12 },
  attachmentCopy: { flex: 1, paddingVertical: spacing.xs },
  imageAttachmentCopy: { flex: 0, width: "100%", paddingHorizontal: 8, paddingVertical: 5 },
  imageAttachmentCopyWithTime: { paddingRight: 64 },
  attachmentName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 },
  attachmentMeta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, textTransform: "capitalize" },
  openAttachment: { minHeight: 48, minWidth: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  openAttachmentText: { color: chatColors.green, fontFamily: fonts.semibold, fontSize: 12 },
  error: { width: "100%", color: colors.danger, fontFamily: fonts.regular, fontSize: 11, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  audioAttachment: { width: "100%", flexShrink: 1 },
  audioMediaRow: { minHeight: 52, width: "100%", flexDirection: "row", alignItems: "center", gap: 6 },
  audioControl: { width: 48, height: 48, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  audioControlWell: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "rgba(84,101,111,0.10)" },
  audioControlWellPlaying: { backgroundColor: "rgba(8,127,105,0.13)" },
  audioControlGlyph: { color: chatColors.muted, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 21, marginLeft: 2 },
  audioTrack: { position: "relative", flex: 1, minWidth: 56, height: 24, flexShrink: 1, justifyContent: "center" },
  audioTrackRail: { height: 3, width: "100%", borderRadius: 2, backgroundColor: "#A9B7BC" },
  audioTrackRailPlaying: { backgroundColor: "#76AFA5" },
  audioTrackDot: { position: "absolute", top: 9, width: 6, height: 6, borderRadius: 3, backgroundColor: "#91A4AA" },
  audioTrackDotPlaying: { backgroundColor: chatColors.green },
  audioTrackDotFirst: { left: "18%" },
  audioTrackDotMiddle: { left: "49%" },
  audioTrackDotLast: { right: "16%" },
  audioAvatar: { width: 36, height: 36, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: chatColors.avatar },
  audioAvatarText: { color: chatColors.greenStrong, fontFamily: fonts.semibold, fontSize: 12 },
  audioMic: { position: "absolute", right: -3, bottom: -3, width: 18, height: 18, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#D7F5DE", borderWidth: 1, borderColor: colors.surface },
  footer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.xs },
  footerSpacer: { flex: 1 },
  priority: { alignSelf: "flex-start", borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  important: { backgroundColor: colors.warningSoft },
  critical: { backgroundColor: colors.dangerSoft },
  resolved: { opacity: 0.66 },
  priorityText: { color: colors.warning, fontFamily: fonts.semibold, fontSize: 9, textTransform: "uppercase" },
  criticalText: { color: colors.danger },
  time: { color: chatColors.muted, fontFamily: fonts.regular, fontSize: 9, lineHeight: 13 },
  inlineTextTime: { position: "absolute", right: 8, bottom: 4 },
  inlineAudioTime: { position: "absolute", right: 50, bottom: 3 },
  inlineImageTime: { position: "absolute", right: 8, bottom: 4 },
  replyIndicator: {
    position: "absolute",
    top: "50%",
    width: 36,
    height: 36,
    marginTop: -18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.94)",
    shadowColor: "#0B141A",
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2
  },
  leftReplyIndicator: { left: 8 },
  rightReplyIndicator: { right: 8, transform: [{ scaleX: -1 }] },
  replyIndicatorGlyph: { color: chatColors.greenStrong, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 22 }
});
