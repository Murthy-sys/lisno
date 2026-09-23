import { router, useNavigationContainerRef } from "expo-router";
import { CommonActions, StackActions } from "expo-router/react-navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, Keyboard } from "react-native";

import { useRuntime, type RuntimeContextValue } from "../runtime/RuntimeProvider";
import { BackEntryOwnership, readAppStack, resolveBackAction, type AppStack, type BackAction } from "./backNavigationPolicy";

function ownerFence(context: RuntimeContextValue): string | null {
  if (!context.configured || context.session.status !== "authenticated" || !context.session.session) return null;
  return JSON.stringify([context.environment.environment.id, context.environment.generation, context.session.generation, context.session.session.user.id, context.session.session.user.role]);
}

type Handler = () => boolean;
interface BackNavigationContextValue {
  readonly routeKey: string | undefined;
  readonly available: boolean;
  readonly fence: string | null;
  requestBack(routeKey?: string): boolean;
  returnToParent(path: string, routeKey?: string): boolean;
  registerInterceptor(routeKey: string, handler: Handler): () => void;
  registerBlock(routeKey: string, handler: Handler): () => void;
}

const BackNavigationContext = createContext<BackNavigationContextValue | null>(null);

export function useBackNavigation(): BackNavigationContextValue {
  const value = useContext(BackNavigationContext);
  if (!value) throw new Error("Back navigation requires BackNavigationProvider.");
  return value;
}

export function BackNavigationProvider({ children }: { readonly children: ReactNode }) {
  const navigation = useNavigationContainerRef();
  const runtime = useRuntime();
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const ownership = useRef(new BackEntryOwnership()).current;
  const interceptors = useRef(new Map<string, Handler>());
  const blocks = useRef(new Map<string, Handler>());
  const [stack, setStack] = useState<AppStack | null>(null);
  const fence = ownerFence(runtime);

  const readCurrent = useCallback(() => {
    const current = navigation.isReady() ? readAppStack(navigation.getRootState()) : null;
    ownership.observe(ownerFence(runtimeRef.current), current);
    return current;
  }, [navigation, ownership]);

  useLayoutEffect(() => {
    setStack(readCurrent());
  }, [fence, readCurrent]);

  useEffect(() => {
    const sync = () => setStack(readCurrent());
    const unsubscribeState = navigation.addListener("state", sync);
    const unsubscribeReady = navigation.addListener("ready", sync);
    sync();
    return () => { unsubscribeState(); unsubscribeReady(); };
  }, [navigation, readCurrent]);

  const register = useCallback((map: Map<string, Handler>, key: string, handler: Handler) => {
    map.set(key, handler);
    return () => { if (map.get(key) === handler) map.delete(key); };
  }, []);
  const registerInterceptor = useCallback((key: string, handler: Handler) => register(interceptors.current, key, handler), [register]);
  const registerBlock = useCallback((key: string, handler: Handler) => register(blocks.current, key, handler), [register]);

  const navigate = useCallback((current: AppStack, action: BackAction): boolean => {
    const source = current.routes[current.index]?.key;
    switch (action.kind) {
      case "none": return false;
      case "pop":
        navigation.dispatch({ ...StackActions.pop(action.count), target: current.key, ...(source ? { source } : {}) });
        return true;
      case "replace":
        router.replace(action.path as never);
        return true;
      case "sign-in": {
        // Remove every secure-link entry, including links opened over other links.
        const action = CommonActions.reset({ index: 0, routes: [{ name: "sign-in" }] });
        if (!action.payload) return false;
        navigation.dispatch({ type: action.type, payload: action.payload, target: current.key });
        return true;
      }
    }
  }, [navigation]);

  const execute = useCallback((expectedKey?: string, parent?: string) => {
    const current = readCurrent();
    const key = current?.routes[current.index]?.key;
    if (!current || !key || (expectedKey && key !== expectedKey)) return false;
    const context = runtimeRef.current;
    const session = context.configured && context.session.status === "authenticated" ? context.session.session : null;
    if (!parent && interceptors.current.get(key)?.()) return true;
    if (blocks.current.get(key)?.()) return true;
    const action = resolveBackAction(current, session, ownerFence(context), ownership, parent);
    if (action.kind === "none" && session && current.routes[current.index]?.name === "access-denied") return true;
    return navigate(current, action);
  }, [navigate, ownership, readCurrent]);

  const requestBack = useCallback((key?: string) => execute(key), [execute]);
  const returnToParent = useCallback((path: string, key?: string) => execute(key, path), [execute]);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (Keyboard.isVisible()) { Keyboard.dismiss(); return true; }
      return requestBack();
    });
    return () => listener.remove();
  }, [requestBack]);

  const session = runtime.configured && runtime.session.status === "authenticated" ? runtime.session.session : null;
  const available = resolveBackAction(stack, session, fence, ownership).kind !== "none";
  const value = useMemo(() => ({ routeKey: stack?.routes[stack.index]?.key, available, fence, requestBack, returnToParent, registerInterceptor, registerBlock }), [stack, available, fence, requestBack, returnToParent, registerInterceptor, registerBlock]);
  return <BackNavigationContext.Provider value={value}>{children}</BackNavigationContext.Provider>;
}
