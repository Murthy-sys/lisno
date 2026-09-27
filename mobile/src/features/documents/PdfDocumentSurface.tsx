import type { PdfView as PdfViewType } from "@kishannareshpal/expo-pdf";
import { useLayoutEffect, useRef } from "react";
import { StyleSheet } from "react-native";

/** Android's PDF engine does not report every invalid-document failure. */
export const PDF_LOAD_TIMEOUT_MS = 45_000;

export interface PdfDocumentSurfaceProps {
  readonly uri: string;
  readonly onReady: (pageCount: number) => void;
  readonly onError: () => void;
}

/** Receives only an app-private file URI. Native error payloads may contain paths. */
export function PdfDocumentSurface({ uri, onReady, onError }: PdfDocumentSurfaceProps) {
  const callbacksRef = useRef({ onReady, onError });
  const settledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  callbacksRef.current = { onReady, onError };

  const settle = (result: number | null) => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (result !== null && Number.isSafeInteger(result) && result > 0) callbacksRef.current.onReady(result);
    else callbacksRef.current.onError();
  };

  useLayoutEffect(() => {
    settledRef.current = false;
    timerRef.current = setTimeout(() => settle(null), PDF_LOAD_TIMEOUT_MS);
    return () => {
      settledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [uri]);

  // The native module is loaded only when a PDF is actually shown. This also
  // keeps image-only screens and Jest's non-native render paths independent of it.
  const PdfView = (require("@kishannareshpal/expo-pdf") as { PdfView: typeof PdfViewType }).PdfView;
  return (
    <PdfView
      accessibilityLabel="PDF document pages"
      autoScale
      doubleTapToZoom
      fitMode="width"
      horizontal={false}
      onError={() => settle(null)}
      onLoadComplete={({ pageCount }) => settle(pageCount)}
      pageGap={8}
      pagingEnabled={false}
      style={styles.pdf}
      testID="protected-document-pdf"
      uri={uri}
    />
  );
}

const styles = StyleSheet.create({ pdf: { width: "100%", height: "100%" } });
