import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts, spacing } from "../../ui/tokens";
import { PdfDocumentSurface } from "./PdfDocumentSurface";
import { useProtectedDocument, type ProtectedDocumentSource } from "./useProtectedDocument";

export interface ProtectedDocumentViewerProps {
  readonly visible: boolean;
  readonly source: ProtectedDocumentSource | null;
  readonly onClose: () => void;
  /** A page editor can render its controls over the same private, local image. */
  readonly renderImage?: ((localUri: string) => ReactNode) | undefined;
}

interface PreviewState {
  readonly identity: string;
  readonly uri: string;
  readonly status: "ready" | "error";
}

export function ProtectedDocumentViewer({ visible, source, onClose, renderImage }: ProtectedDocumentViewerProps) {
  const document = useProtectedDocument(source, visible);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const visibleRef = useRef(visible);
  const onCloseRef = useRef(onClose);
  const mountedRef = useRef(true);
  const activePreviewRef = useRef<{ readonly identity: string | null; readonly uri: string | null }>({ identity: null, uri: null });
  visibleRef.current = visible;
  onCloseRef.current = onClose;
  activePreviewRef.current = {
    identity: visible ? document.identity : null,
    uri: visible && document.status === "ready" ? document.localUri : null
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const mimeType = source?.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const name = source?.fileName.trim() || "Document";
  const previewIdentity = document.identity;
  const previewUri = document.status === "ready" ? document.localUri : null;
  const previewStatus = previewIdentity && previewUri && preview?.identity === previewIdentity && preview.uri === previewUri
    ? preview.status
    : "loading";
  const previewFailed = document.status === "ready" && ((!isImage && !isPdf) || (!renderImage && previewStatus === "error"));
  const canDownloadFallback = source?.kind === "design-file" && previewFailed;

  const recordPreview = (status: PreviewState["status"]) => {
    if (!previewIdentity || !previewUri || !visibleRef.current || !mountedRef.current) return;
    const active = activePreviewRef.current;
    if (active.identity !== previewIdentity || active.uri !== previewUri) return;
    setPreview((current) => {
      if (status === "ready" && current?.identity === previewIdentity && current.uri === previewUri && current.status === "error") {
        return current;
      }
      return { identity: previewIdentity, uri: previewUri, status };
    });
  };

  const downloadFallback = async () => {
    const identity = document.identity;
    const opened = await document.openExternally();
    if (opened && mountedRef.current && visibleRef.current && activePreviewRef.current.identity === identity) {
      onCloseRef.current();
    }
  };

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
            accessibilityLabel="Close document viewer"
            accessibilityRole="button"
            hitSlop={4}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
          >
            <Text accessibilityElementsHidden style={styles.closeGlyph}>×</Text>
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.filename}>{name}</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.headerSpacer} />
        </View>

        <View style={styles.stage}>
          {isImage && previewUri && !previewFailed ? (
            renderImage ? renderImage(previewUri) : (
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel={`Image ${name}`}
                accessible
                onError={() => recordPreview("error")}
                onLoad={() => recordPreview("ready")}
                resizeMode="contain"
                source={{ uri: previewUri }}
                style={styles.documentSurface}
                testID="protected-document-image"
              />
            )
          ) : null}

          {isPdf && previewUri && !previewFailed ? (
            <View key={previewIdentity} style={styles.documentSurface}>
              <PdfDocumentSurface
                uri={previewUri}
                onReady={() => recordPreview("ready")}
                onError={() => recordPreview("error")}
              />
            </View>
          ) : null}

          {document.status === "loading" || document.sharing || (previewUri && (isPdf || (isImage && !renderImage)) && previewStatus === "loading") ? (
            <View accessible accessibilityLabel={document.sharing ? "Downloading document" : isPdf ? "Loading PDF" : "Loading document image"} accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.status}>
              <ActivityIndicator color="#F3F1E9" size="small" />
              <Text style={styles.statusText}>{document.sharing ? "Downloading document…" : isPdf ? "Loading PDF…" : "Loading image…"}</Text>
            </View>
          ) : null}

          {visible && !source ? (
            <View accessibilityLiveRegion="polite" style={styles.errorBlock}>
              <Text accessibilityRole="header" style={styles.errorTitle}>Document unavailable</Text>
              <Text style={styles.errorCopy}>Choose a document to open.</Text>
            </View>
          ) : null}

          {document.status === "error" && document.error ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorBlock}>
              <Text accessibilityRole="header" style={styles.errorTitle}>Unable to open document</Text>
              <Text style={styles.errorCopy}>{document.error.message}</Text>
              <Pressable
                accessibilityLabel={`Retry opening ${name}`}
                accessibilityRole="button"
                onPress={document.retry}
                style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {previewFailed ? (
            <View accessibilityLiveRegion="assertive" style={styles.errorBlock}>
              <Text accessibilityRole="header" style={styles.errorTitle}>Preview unavailable</Text>
              <Text style={styles.errorCopy}>
                {isPdf ? "This PDF could not be displayed on this device." : isImage ? "This image could not be displayed on this device." : "This file type cannot be previewed in the app."}
              </Text>
              {isPdf || isImage ? (
                <Pressable
                  accessibilityLabel={`Retry previewing ${name}`}
                  accessibilityRole="button"
                  disabled={document.sharing}
                  onPress={document.retry}
                  style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              ) : null}
              {canDownloadFallback ? (
                <Pressable
                  accessibilityLabel={`Download ${name}`}
                  accessibilityRole="button"
                  disabled={document.sharing}
                  onPress={() => void downloadFallback()}
                  style={({ pressed }) => [styles.fallbackButton, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.fallbackText}>Download</Text>
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
  safeArea: { flex: 1, backgroundColor: "#111713" },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xs, backgroundColor: "#253126" },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  closeGlyph: { color: "#F3F1E9", fontFamily: fonts.regular, fontSize: 34, lineHeight: 38, textAlign: "center" },
  filename: { flex: 1, color: "#F3F1E9", fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: "center", paddingHorizontal: spacing.xs },
  headerSpacer: { width: 48, height: 48 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#111713" },
  documentSurface: { width: "100%", height: "100%" },
  status: { position: "absolute", minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: "#111713" },
  statusText: { color: "#F3F1E9", fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  errorBlock: { width: "100%", maxWidth: 320, alignItems: "center", gap: spacing.xs, padding: spacing.md },
  errorTitle: { color: "#F3F1E9", fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, textAlign: "center" },
  errorCopy: { color: "#D4D9CD", fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, textAlign: "center" },
  retryButton: { minWidth: 88, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, backgroundColor: "#F3F1E9" },
  retryText: { color: "#253126", fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  fallbackButton: { minWidth: 88, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 1, borderColor: "#F3F1E9" },
  fallbackText: { color: "#F3F1E9", fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.7 }
});
