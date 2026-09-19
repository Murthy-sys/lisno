import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SelectedAsset } from "../../platform/files";
import { colors, fonts, radii, spacing } from "../../ui/tokens";
import type { PresentedAttachment, PresentedMessage } from "./chatModel";

export interface StagedChatAttachment {
  readonly clientUploadId: string;
  readonly attachment: PresentedAttachment;
  readonly expiresAt: string;
  readonly isVoiceNote?: boolean;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function ComposerTray({
  reply,
  priority,
  selectedAsset,
  selectedIsVoiceNote,
  staged,
  uploading,
  uploadProgress,
  recordingStarting,
  recording,
  recordingElapsedSeconds,
  recordingNotice,
  error,
  showCameraSettings,
  showMediaRetry,
  disabled,
  onCancelReply,
  onCancelRecording,
  onClearPriority,
  onOpenCameraSettings,
  onRetryMedia,
  onRemoveSelected,
  onRetryUpload,
  onRemoveStaged
}: {
  readonly reply: PresentedMessage | null;
  readonly priority: "normal" | "important" | "critical";
  readonly selectedAsset: SelectedAsset | null;
  readonly selectedIsVoiceNote: boolean;
  readonly staged: readonly StagedChatAttachment[];
  readonly uploading: boolean;
  readonly uploadProgress: number | null;
  readonly recordingStarting: boolean;
  readonly recording: boolean;
  readonly recordingElapsedSeconds: number;
  readonly recordingNotice: string | null;
  readonly error: string | null;
  readonly showCameraSettings: boolean;
  readonly showMediaRetry: boolean;
  readonly disabled: boolean;
  readonly onCancelReply: () => void;
  readonly onCancelRecording: () => void;
  readonly onClearPriority: () => void;
  readonly onOpenCameraSettings: () => void;
  readonly onRetryMedia: () => void;
  readonly onRemoveSelected: () => void;
  readonly onRetryUpload: () => void;
  readonly onRemoveStaged: (item: StagedChatAttachment) => void;
}) {
  const visible = reply || priority !== "normal" || selectedAsset || staged.length || recordingStarting || recording || recordingNotice || error;
  if (!visible) return null;
  return (
    <View style={styles.tray}>
      {reply ? (
        <View style={styles.reply}>
          <View style={styles.grow}>
            <Text style={styles.kicker}>Replying to {reply.author}</Text>
            <Text numberOfLines={1} style={styles.copy}>{reply.body || reply.attachments[0]?.filename || "Attachment"}</Text>
          </View>
          <TrayButton disabled={disabled} label="Cancel reply" text="×" onPress={onCancelReply} />
        </View>
      ) : null}
      {priority !== "normal" ? (
        <View style={styles.row}>
          <View style={[styles.priority, priority === "critical" ? styles.priorityCritical : null]}>
            <Text style={[styles.priorityText, priority === "critical" ? styles.priorityCriticalText : null]}>{priority}</Text>
          </View>
          <TrayButton disabled={disabled} label="Clear message importance" text="×" onPress={onClearPriority} />
        </View>
      ) : null}
      {recordingStarting ? (
        <View accessibilityLiveRegion="polite" style={styles.row}>
          <View style={styles.requestingDot} />
          <Text style={styles.recordingText}>Requesting microphone…</Text>
          <TrayButton disabled={disabled} label="Cancel voice note" text="Cancel" onPress={onCancelRecording} />
        </View>
      ) : null}
      {recording ? (
        <View style={styles.row}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording · {formatElapsed(recordingElapsedSeconds)}</Text>
          <TrayButton disabled={disabled} label="Cancel voice note" text="Cancel" onPress={onCancelRecording} />
        </View>
      ) : null}
      {recordingNotice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{recordingNotice}</Text> : null}
      {selectedAsset ? (
        <View style={styles.asset}>
          <View style={styles.grow}>
            <Text numberOfLines={1} style={styles.assetName}>{selectedIsVoiceNote ? "Voice note" : selectedAsset.name}</Text>
            <Text style={styles.assetMeta}>{selectedAsset.mimeType} · {formatBytes(selectedAsset.size)}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.copy}>
              {uploading
                ? uploadProgress === null
                  ? "Uploading…"
                  : `Uploading ${Math.round(uploadProgress * 100)}%`
                : "Ready to retry upload"}
            </Text>
          </View>
          {!uploading ? <TrayButton disabled={disabled} label="Retry attachment upload" text="Retry" onPress={onRetryUpload} /> : null}
          <TrayButton disabled={disabled} label={`Remove ${selectedAsset.name}`} text="×" onPress={onRemoveSelected} />
        </View>
      ) : null}
      {staged.map((item) => (
        <View key={item.attachment.id} style={styles.asset}>
          <View style={styles.grow}>
            <Text numberOfLines={1} style={styles.assetName}>{item.isVoiceNote ? "Voice note" : item.attachment.filename}</Text>
            <Text style={styles.assetMeta}>
              {item.isVoiceNote
                ? `Voice note · ${item.attachment.mimeType} · ${formatBytes(item.attachment.byteSize)} · Ready to send`
                : `${item.attachment.kind} · ${formatBytes(item.attachment.byteSize)} · Ready to send`}
            </Text>
          </View>
          <TrayButton disabled={disabled} label={`Remove ${item.attachment.filename}`} text="×" onPress={() => onRemoveStaged(item)} />
        </View>
      ))}
      {error ? (
        <View style={styles.errorRow}>
          <Text accessibilityLiveRegion="assertive" style={[styles.error, styles.grow]}>{error}</Text>
          {showCameraSettings ? (
            <TrayButton disabled={disabled} label="Open camera settings" text="Open settings" onPress={onOpenCameraSettings} />
          ) : null}
          {showMediaRetry ? (
            <TrayButton disabled={disabled} label="Retry media options" text="Retry" onPress={onRetryMedia} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function TrayButton({
  disabled,
  label,
  text,
  onPress
}: {
  readonly disabled: boolean;
  readonly label: string;
  readonly text: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.trayButton, disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
    >
      <Text style={styles.trayButtonText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tray: { gap: 6, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  reply: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.surfaceMuted, borderRadius: radii.control, paddingLeft: spacing.sm },
  asset: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderRadius: radii.control, backgroundColor: colors.surfaceMuted, paddingLeft: spacing.sm },
  grow: { flex: 1 },
  kicker: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 11 },
  copy: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 15 },
  assetName: { color: colors.ink, fontFamily: fonts.medium, fontSize: 12 },
  assetMeta: { color: colors.inkMuted, fontFamily: fonts.regular, fontSize: 10, lineHeight: 15, textTransform: "capitalize" },
  priority: { borderRadius: radii.pill, backgroundColor: colors.warningSoft, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  priorityCritical: { backgroundColor: colors.dangerSoft },
  priorityText: { color: colors.warning, fontFamily: fonts.semibold, fontSize: 10, textTransform: "uppercase" },
  priorityCriticalText: { color: colors.danger },
  recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  requestingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warning },
  recordingText: { color: colors.danger, fontFamily: fonts.medium, fontSize: 11 },
  error: { color: colors.danger, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 },
  errorRow: { minHeight: 48, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  trayButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xs },
  trayButtonText: { color: colors.violet, fontFamily: fonts.semibold, fontSize: 12 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.72 }
});
