import axe from "axe-core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../../api/client";
import { beginApiRequest, requestActivity } from "../../api/requestActivity";
import { GlobalRequestLoader } from "./GlobalRequestLoader";

afterEach(() => {
  expect(requestActivity.getSnapshot()).toBe(0);
});

describe("GlobalRequestLoader", () => {
  it("shows the logo until overlapping API calls finish, including failures", async () => {
    let respond!: (response: Response) => void;
    let fail!: (error: Error) => void;
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }))
      .mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    render(<GlobalRequestLoader />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    let read!: Promise<unknown>;
    let save!: Promise<unknown>;
    act(() => {
      read = apiClient.get("/example");
      save = apiClient.post("/example", {});
    });
    const status = screen.getByRole("status", { name: "Request status" });
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector("img")).toHaveAttribute("src", "/lisno-logo.svg");
    expect(screen.getAllByRole("status")).toHaveLength(1);

    await act(async () => {
      respond(Response.json({ data: { ready: true } }));
      await read;
    });
    expect(status).toBeInTheDocument();

    await act(async () => {
      const rejected = expect(save).rejects.toThrow("Unavailable");
      fail(new Error("Unavailable"));
      await rejected;
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("recovers already pending activity on mount and remount under StrictMode", () => {
    const finish = beginApiRequest();
    try {
      const first = render(<StrictMode><GlobalRequestLoader /></StrictMode>);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      first.unmount();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      render(<StrictMode><GlobalRequestLoader /></StrictMode>);
      expect(screen.getAllByRole("status")).toHaveLength(1);
    } finally {
      act(finish);
    }
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps controls usable and focused while providing an accessible loading status", async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    render(<>
      <main>
        <h1>Example form</h1>
        <label>Project name<input /></label>
        <button onClick={cancel}>Cancel</button>
      </main>
      <GlobalRequestLoader />
    </>);
    const input = screen.getByRole("textbox", { name: "Project name" });
    await user.click(input);
    let finish!: () => void;
    act(() => { finish = beginApiRequest(); });
    try {
      expect(input).toHaveFocus();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await user.type(input, "Example");
      expect(input).toHaveValue("Example");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(cancel).toHaveBeenCalledOnce();
      // JSDOM has no layout engine; contrast requires browser verification.
      expect((await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    } finally {
      act(finish);
    }
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });
});
