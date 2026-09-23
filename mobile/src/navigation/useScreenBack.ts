import { useFocusEffect, useRoute } from "expo-router";
import { useCallback, useRef } from "react";

import { useBackNavigation } from "./BackNavigationProvider";

/** Native Back is dispatched once at the root; only focused local handlers register. */
export function useBackInterceptor(handler: () => boolean): void {
  const { registerInterceptor, fence } = useBackNavigation();
  const { key } = useRoute();
  const latest = useRef(handler);
  latest.current = handler;
  useFocusEffect(useCallback(() => registerInterceptor(key, () => latest.current()), [registerInterceptor, key, fence]));
}

export function useScreenBack({ blocked }: { readonly blocked?: boolean } = {}) {
  const navigation = useBackNavigation();
  const { key } = useRoute();
  const latestBlocked = useRef(blocked);
  latestBlocked.current = blocked;
  const registersBlock = blocked !== undefined;
  useFocusEffect(useCallback(() => {
    if (!registersBlock) return;
    return navigation.registerBlock(key, () => latestBlocked.current === true);
  }, [navigation.registerBlock, navigation.fence, key, registersBlock]));
  const onBack = useCallback(() => navigation.requestBack(key), [navigation.requestBack, key]);
  const returnToParent = useCallback((path: string) => navigation.returnToParent(path, key), [navigation.returnToParent, key]);
  return { visible: navigation.routeKey === key && navigation.available, disabled: blocked === true, onBack, returnToParent };
}
