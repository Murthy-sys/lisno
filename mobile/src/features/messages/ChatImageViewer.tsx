import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts, radii, spacing } from "../../ui/tokens";

export interface ChatImageViewerProps {
  readonly visible: boolean;
  readonly localUri: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly filename: string;
  readonly onClose: () => void;
  readonly onRetry?: (() => void) | undefined;
}

export function ChatImageViewer({
  visible,
  localUri,
  loading,
  error,
  filename,
  onClose,
  onRetry
}: ChatImageViewerProps) {
  const displayName = filename.trim() || "Image";
  const hasImage = Boolean(localUri);
  const showUnavailable = !loading && !hasImage;
  const showError = Boolean(error) || showUnavailable;

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible={visible}
    >
      {visible ? <StatusBar style="light" /> : null}
      <SafeAreaView accessibilityViewIsModal edges={["top", "right", "bottom", "left"]} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close image viewer"
            accessibilityRole="button"
            hitSlop={4}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed ? styles.controlPressed : null]}
          >
            <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.closeGlyph}>×</Text>
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.filename}>{displayName}</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.headerSpacer} />
        </View>

        <View style={styles.stage}>
          {localUri ? (
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={`Image ${displayName}`}
              accessible
              resizeMode="contain"
              source={{ uri: localUri }}
              style={styles.image}
              testID="chat-image-viewer-image"
            />
          ) : null}

          {loading ? (
            <View
              accessible
              accessibilityLabel="Loading image"
              accessibilityLiveRegion="polite"
              accessibilityRole="progressbar"
              style={[styles.statusCard, hasImage ? styles.statusCardOverlay : null]}
            >
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.statusText}>Loading image…</Text>
            </View>
          ) : null}

          {!loading && showError ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorCard}>
              <Text accessibilityRole="header" style={styles.errorTitle}>Unable to display image</Text>
              <Text style={styles.errorCopy}>Try loading it again.</Text>
              {onRetry ? (
                <Pressable
                  accessibilityLabel={`Retry loading ${displayName}`}
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={({ pressed }) => [styles.retryButton, pressed ? styles.controlPressed : null]}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#090B0C"
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    backgroundColor: "#111416"
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  closeGlyph: {
    color: "#FFFFFF",
    fontFamily: fonts.regular,
    fontSize: 34,
    lineHeight: 38,
    textAlign: "center"
  },
  filename: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: spacing.xs
  },
  headerSpacer: {
    width: 48,
    height: 48
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: "#090B0C"
  },
  image: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%"
  },
  statusCard: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  statusCardOverlay: {
    backgroundColor: "rgba(17, 20, 22, 0.82)"
  },
  statusText: {
    color: "#FFFFFF",
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19
  },
  errorCard: {
    width: "100%",
    maxWidth: 304,
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.surface,
    padding: spacing.md,
    backgroundColor: "rgba(17, 20, 22, 0.92)"
  },
  errorTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center"
  },
  errorCopy: {
    color: "#C9CED0",
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center"
  },
  retryButton: {
    minWidth: 88,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: "#FFFFFF"
  },
  retryText: {
    color: "#111416",
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20
  },
  controlPressed: {
    opacity: 0.7
  }
});
