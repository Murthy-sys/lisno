import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { DownloadedArtifact } from "../../platform/files";
import { useConfiguredRuntime } from "../../runtime/RuntimeProvider";
import { colors, fonts } from "../../ui/tokens";
import type { PresentedLastMessageAttachment } from "./chatModel";

export const CONVERSATION_THUMBNAIL_LIMIT = 2;
/** The list preview has no byte size, so bound each thumbnail download explicitly. */
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_MIME_TYPE = "image/webp";

export function previewableImages(
  attachments: readonly PresentedLastMessageAttachment[]
): readonly PresentedLastMessageAttachment[] {
  return attachments.filter((attachment) => attachment.kind === "image" && attachment.hasPreview)
    .slice(0, CONVERSATION_THUMBNAIL_LIMIT);
}

function Thumbnail({ projectId, attachment }: {
  readonly projectId: string;
  readonly attachment: PresentedLastMessageAttachment;
}) {
  const context = useConfiguredRuntime();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let artifact: DownloadedArtifact | null = null;
    setUri(null);
    // Same authenticated preview operation the chat thread uses; no URLs or tokens leave the transfer layer.
    const transfer = context.runtime.transfers.download({
      path: `/projects/${encodeURIComponent(projectId)}/chat/attachments/${encodeURIComponent(attachment.id)}/preview`,
      fileName: `preview-${attachment.filename}`,
      mimeType: THUMBNAIL_MIME_TYPE,
      maxBytes: THUMBNAIL_MAX_BYTES
    });
    void transfer.result.then((downloaded) => {
      if (!active) {
        void downloaded.release();
        return;
      }
      artifact = downloaded;
      setUri(downloaded.uri);
    }).catch(() => {
      // The muted placeholder stays visible; a list preview never escalates or logs failures.
    });
    return () => {
      active = false;
      transfer.cancel();
      if (artifact) void artifact.release();
      artifact = null;
    };
  }, [attachment.filename, attachment.id, context.runtime.transfers, projectId]);

  return (
    <View style={styles.thumbnail} testID={`conversation-thumbnail-${attachment.id}`}>
      {uri ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setUri(null)}
          resizeMode="cover"
          source={{ uri }}
          style={styles.image}
          testID={`conversation-thumbnail-image-${attachment.id}`}
        />
      ) : null}
    </View>
  );
}

export interface ConversationThumbnailsProps {
  readonly projectId: string;
  readonly attachments: readonly PresentedLastMessageAttachment[];
  readonly attachmentCount: number;
}

/** Decorative image previews for a conversation row; the row label carries the meaning. */
export function ConversationThumbnails({ projectId, attachments, attachmentCount }: ConversationThumbnailsProps) {
  const images = previewableImages(attachments);
  if (!images.length) return null;
  const remaining = Math.max(attachmentCount - images.length, 0);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.row}
      testID="conversation-thumbnails"
    >
      {images.map((attachment) => (
        <Thumbnail attachment={attachment} key={attachment.id} projectId={projectId} />
      ))}
      {remaining > 0 ? <Text style={styles.more}>+{remaining}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  thumbnail: { width: 72, height: 56, overflow: "hidden", borderRadius: 10, backgroundColor: colors.surfaceMuted },
  image: { width: "100%", height: "100%" },
  more: { color: colors.inkMuted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, marginLeft: 2 }
});
