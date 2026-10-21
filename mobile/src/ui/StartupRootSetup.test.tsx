import { render } from "@testing-library/react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StrictMode } from "react";

import RootLayout from "../app/_layout";

jest.mock("expo-splash-screen", () => ({
  setOptions: jest.fn(),
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => undefined)
}));
jest.mock("expo-font", () => ({ useFonts: jest.fn(() => [false, null]) }));
jest.mock("react-native-reanimated", () => ({}));
jest.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: jest.requireActual("react-native").View }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: jest.requireActual("react-native").View }));
jest.mock("../runtime/RuntimeProvider", () => ({ RuntimeProvider: jest.requireActual("react-native").View }));
jest.mock("../navigation/BackNavigationProvider", () => ({ BackNavigationProvider: jest.requireActual("react-native").View }));
jest.mock("../features/onboarding/useReducedMotion", () => ({ useReducedMotion: () => false }));
jest.mock("./StartupExperience", () => ({
  StartupExperience: jest.requireActual("react-native").View,
  useStartupAssets: () => "ready"
}));
jest.mock("expo-router", () => ({ Stack: jest.requireActual("react-native").View }));

it("disables native exit fading once before mounting and retains protection while fonts prepare", async () => {
  expect(SplashScreen.setOptions).toHaveBeenCalledTimes(1);
  expect(SplashScreen.setOptions).toHaveBeenCalledWith({ duration: 0, fade: false });
  expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  expect(jest.mocked(SplashScreen.setOptions).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(SplashScreen.preventAutoHideAsync).mock.invocationCallOrder[0]!);

  const view = await render(<StrictMode><RootLayout /></StrictMode>);
  expect(view.toJSON()).toBeNull();
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  jest.mocked(useFonts).mockReturnValue([true, null]);
  await view.rerender(<StrictMode><RootLayout /></StrictMode>);
  expect(view.toJSON()).not.toBeNull();
  expect(SplashScreen.setOptions).toHaveBeenCalledTimes(1);
  expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
});
