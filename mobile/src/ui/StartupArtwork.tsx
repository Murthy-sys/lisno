import { Image } from "react-native";

import { startupAssets } from "./startupAssets";

export type StartupMotifKind = keyof typeof startupAssets;

export function StartupMotif({ kind, size }: { readonly kind: StartupMotifKind; readonly size: number }) {
  return (
    <Image
      source={startupAssets[kind].source}
      style={{ width: size, height: size }}
      resizeMode="contain"
      fadeDuration={0}
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`startup-image-${kind}`}
    />
  );
}
