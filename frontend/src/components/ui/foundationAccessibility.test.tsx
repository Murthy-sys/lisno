import axe from "axe-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import {
  FoundationQaPage,
  type FoundationQaState
} from "../../test/fixtures/FoundationQaPage";
import {
  createFoundationQaAxeController,
  installFoundationQaAxeHook,
  resolveFoundationQaTarget
} from "../../test/fixtures/foundationQaEntry";

const states = [
  "default",
  "loading",
  "empty",
  "error",
  "conflict",
  "session-expired",
  "toast",
  "drawer"
] as const satisfies readonly FoundationQaState[];

async function runAxe() {
  const context = {
    canvas: document.createElement("canvas"),
    clearRect: () => undefined,
    fillText: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    measureText: (text: string) => ({ width: Math.max(text.length, 1) * 10 })
  } as unknown as CanvasRenderingContext2D;
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context);

  try {
    return await axe.run(document.body);
  } finally {
    getContext.mockRestore();
  }
}

describe("FoundationQaPage", () => {
  it.each(states)("keeps the %s state to one page landmark and axe-clean", async (state) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithQuery(<FoundationQaPage state={state} />);

    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await runAxe()).violations).toEqual([]);
  });

  it("renders the representative default primitive inventory", () => {
    renderWithQuery(<FoundationQaPage state="default" />);

    for (const name of [
      "Primary action",
      "Secondary action",
      "Quiet action",
      "Delete item"
    ]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Unavailable action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("button", { name: "Open settings" })).toBeVisible();
    expect(screen.getByLabelText("Project name")).toBeValid();
    expect(screen.getByLabelText("Reference code")).toBeInvalid();
    expect(screen.getByLabelText("Reference code")).toHaveAccessibleDescription(
      "Use a six-character reference."
    );

    for (const name of ["Draft", "Ready", "At risk", "Blocked", "Information"]) {
      expect(screen.getByText(name)).toBeVisible();
    }
    expect(screen.getByRole("progressbar", { name: "Foundation progress" })).toHaveAttribute(
      "aria-valuenow",
      "64"
    );
    expect(screen.getByRole("progressbar", { name: "Preparing preview" })).not.toHaveAttribute(
      "aria-valuenow"
    );
    expect(screen.getByRole("region", { name: "Foundation surface" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "UI foundation gallery" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Shared primitives" })).toBeVisible();
    expect(screen.getByRole("alert", { name: "Validation guidance" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Foundation notice" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "No archived items" })).toBeVisible();
    expect(document.querySelector(".ui-skeleton")).toHaveAttribute("aria-hidden", "true");
    expect(within(screen.getByRole("region", { name: "Notifications" })).getAllByRole("article"))
      .toHaveLength(1);
  });

  it("exposes the Tooltip through the real IconButton focus behavior", async () => {
    renderWithQuery(<FoundationQaPage state="default" />);
    const button = screen.getByRole("button", { name: "Open settings" });

    button.focus();

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Open foundation settings");
    expect(button).toHaveAccessibleDescription("Open foundation settings");
    expect(button.querySelector("svg")).toEqual(expect.any(SVGElement));
  });

  it("uses existing state semantics for loading, empty, and error outcomes", () => {
    const loading = renderWithQuery(<FoundationQaPage state="loading" />);
    expect(screen.getByRole("status", { name: "Foundation loading status" })).toHaveTextContent(
      "Loading foundation content…"
    );
    expect(loading.container.querySelector(".ui-state__skeleton")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    loading.unmount();

    const empty = renderWithQuery(<FoundationQaPage state="empty" />);
    expect(screen.getByText("No foundation records yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create record" })).toBeVisible();
    empty.unmount();

    renderWithQuery(<FoundationQaPage state="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Foundation content is unavailable.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it.each([
    ["conflict", "Editing conflict", "Refresh to load the latest version."],
    ["session-expired", "Session expired", "Your session expired. Sign in again."]
  ] as const)("renders the %s state as a labelled persistent banner", (state, label, copy) => {
    renderWithQuery(<FoundationQaPage state={state} />);

    expect(screen.getByRole("region", { name: label })).toHaveTextContent(copy);
  });

  it("renders one deterministic success toast", () => {
    renderWithQuery(<FoundationQaPage state="toast" />);
    const notifications = screen.getByRole("region", { name: "Notifications" });

    expect(within(notifications).getAllByRole("article")).toHaveLength(1);
    expect(within(notifications).getByText("Foundation saved")).toBeVisible();
    expect(within(notifications).getByRole("button", { name: "Dismiss Foundation saved" }))
      .toBeVisible();
  });

  it("renders the labelled Drawer beside main with a real close action", async () => {
    renderWithQuery(<FoundationQaPage state="drawer" />);
    const main = document.querySelector("main");
    const dialog = screen.getByRole("dialog", { name: "Foundation navigation" });

    expect(main?.parentElement).toBe(dialog.parentElement?.parentElement);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close foundation navigation" })
    );
    expect(screen.queryByRole("dialog", { name: "Foundation navigation" }))
      .not.toBeInTheDocument();
  });
});

describe("foundation QA target safety", () => {
  it.each([
    ["/login", "/login"],
    ["/signup?from=%2Fclient#form", "/signup?from=%2Fclient#form"]
  ] as const)("accepts the same-origin target %s", (target, expected) => {
    expect(resolveFoundationQaTarget(target, "https://lisno.example")).toBe(expected);
  });

  it.each([
    "https://attacker.example/login",
    "//attacker.example/login",
    "\\\\attacker.example\\login",
    "/%5c%5cattacker.example/login",
    "/%2f%2fattacker.example/login",
    "/%252f%252fattacker.example/login",
    "/qa/ui-foundation.html",
    "/%71a/ui-foundation.html",
    "/qa//ui-foundation.html",
    "/%71a/%2fui-foundation.html",
    "/%2571a/%252fui-foundation.html",
    "/qa/ui-foundation.html?target=/login"
  ])("rejects unsafe target %s", (target) => {
    expect(resolveFoundationQaTarget(target, "https://lisno.example")).toBeNull();
  });

  it("waits for the requested iframe identity and scans only its loaded document", async () => {
    const scan = vi.fn(async () => ({ violations: [] }) as unknown as axe.AxeResults);
    const controller = createFoundationQaAxeController(
      "/login",
      "https://lisno.example",
      scan
    );
    const iframeDocument = document.implementation.createHTMLDocument("Target app");
    Object.defineProperty(iframeDocument, "readyState", { value: "complete" });
    const location = { href: "about:blank" };
    const iframe = document.createElement("iframe");
    Object.defineProperties(iframe, {
      contentDocument: { value: iframeDocument },
      contentWindow: { value: { location } }
    });
    const previousHook = window.__lisnoRunAxe;
    installFoundationQaAxeHook(controller);

    try {
      await expect(window.__lisnoRunAxe?.()).rejects.toThrow(
        "UI foundation target iframe is not ready."
      );
      expect(scan).not.toHaveBeenCalled();

      controller.attachIframe(iframe);
      controller.markIframeLoaded(iframe);
      await expect(window.__lisnoRunAxe?.()).rejects.toThrow(
        "UI foundation target iframe is not ready."
      );
      expect(scan).not.toHaveBeenCalled();

      location.href = "https://lisno.example/login";
      controller.markIframeLoaded(iframe);
      await window.__lisnoRunAxe?.();
      expect(scan).toHaveBeenCalledTimes(1);
      expect(scan).toHaveBeenCalledWith(iframeDocument);

      location.href = "https://lisno.example/signup";
      await expect(window.__lisnoRunAxe?.()).rejects.toThrow(
        "UI foundation target iframe is not ready."
      );
      expect(scan).toHaveBeenCalledTimes(1);
    } finally {
      window.__lisnoRunAxe = previousHook;
    }
  });

  it("scans the direct gallery body only when no iframe target was requested", async () => {
    const scan = vi.fn(async () => ({ violations: [] }) as unknown as axe.AxeResults);
    const controller = createFoundationQaAxeController(
      null,
      "https://lisno.example",
      scan
    );

    await controller.run();

    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith(document.body);
  });
});
