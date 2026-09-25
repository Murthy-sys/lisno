import { BlurTargetView, BlurView } from "expo-blur";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useReducedTransparency } from "./ChromeSurface";
import { colors } from "./tokens";

const ModalBackdropContext = createContext<(() => () => void) | null>(null);

/** Native modals remain in their own window; blur captures only the underlying app. */
export function AppModalBackdrop({ children }: { readonly children: ReactNode }) {
  const target = useRef<View | null>(null);
  const owners = useRef(new Set<symbol>());
  const [visible, setVisible] = useState(false);
  const reducedTransparency = useReducedTransparency();
  const acquire = useCallback(() => {
    const owner = Symbol();
    owners.current.add(owner);
    setVisible(true);
    return () => {
      owners.current.delete(owner);
      setVisible(owners.current.size > 0);
    };
  }, []);

  return (
    <ModalBackdropContext.Provider value={acquire}>
      <View style={styles.container}>
        <BlurTargetView
          ref={target}
          testID="app-modal-background"
          style={styles.container}
          accessibilityElementsHidden={visible}
          importantForAccessibility={visible ? "no-hide-descendants" : "auto"}
        >
          {children}
        </BlurTargetView>
        {visible ? (
          <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            {reducedTransparency ? (
              <View testID="app-modal-opaque-backdrop" style={[StyleSheet.absoluteFill, styles.opaque]} />
            ) : (
              <BlurView
                testID="app-modal-blur"
                blurTarget={target}
                blurMethod="dimezisBlurView"
                intensity={55}
                tint="default"
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        ) : null}
      </View>
    </ModalBackdropContext.Provider>
  );
}

export function useModalBackdrop(visible: boolean): void {
  const acquire = useContext(ModalBackdropContext);
  useEffect(() => {
    if (visible) return acquire?.();
  }, [acquire, visible]);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  opaque: { backgroundColor: colors.shell }
});
