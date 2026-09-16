import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAudioBubble, ChatAudioContext, audioTime } from "./ChatAudioBubble";
import { ChatAudioController } from "./chatAudioController";
import { ChatFileTray } from "./ChatFileTray";

let audio: HTMLAudioElement;
beforeEach(() => {
  audio = document.createElement("audio");
  Object.defineProperties(audio, { duration: { configurable: true, value: 65 }, readyState: { configurable: true, value: 1 }, paused: { configurable: true, value: true } });
  vi.spyOn(audio, "play").mockResolvedValue(); vi.spyOn(audio, "pause").mockImplementation(() => undefined); vi.spyOn(audio, "load").mockImplementation(() => undefined);
  vi.stubGlobal("Audio", vi.fn(function () { return audio; }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:local-audio") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
function setup(children: React.ReactNode) {
  const controller = new ChatAudioController({ load: async () => new Blob(["audio"]), current: () => () => true, beforeStart: () => undefined, errorMessage: () => "Unavailable" });
  return { controller, view: render(<ChatAudioContext.Provider value={controller}>{children}</ChatAudioContext.Provider>) };
}
const file = new File(["audio"], "voice.webm", { type: "audio/webm" });
describe("inline chat audio", () => {
  it("renders compact accessible controls and truthful time, then permits seeking after explicit activation", async () => {
    const { view } = setup(<ChatAudioBubble source={{ key: "one", filename: file.name, file }} sender={{ id: "priya", name: "Priya Kumar" }} timestamp={<time>3:30 PM</time>} />);
    expect(screen.getByText("—:—")).toBeVisible();
    expect(screen.getByRole("img", { name: "Audio from Priya Kumar" })).toHaveTextContent("PK");
    expect(screen.getAllByText("3:30 PM")).toHaveLength(1);
    const seek = screen.getByRole("slider", { name: "Seek voice.webm" });
    expect(seek).toBeDisabled(); expect(document.querySelector("audio")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Play voice.webm" }));
    expect(await screen.findByRole("button", { name: "Pause voice.webm" })).toBeVisible();
    expect(seek).toBeEnabled(); expect(seek).toHaveAttribute("aria-valuetext", "0:00 of 1:05");
    fireEvent.change(seek, { target: { value: "30" } });
    expect(audio.currentTime).toBe(30); expect(seek).toHaveAttribute("aria-valuetext", "0:30 of 1:05");
    await userEvent.click(screen.getByRole("button", { name: "Pause voice.webm" }));
    expect(screen.getByRole("button", { name: "Play voice.webm" })).toBeVisible();
    view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-audio"); expect(audio.pause).toHaveBeenCalled();
  });
  it("uses the same audio row for drafts and reports checking instead of sent at 100 percent", () => {
    const remove = vi.fn();
    const { view } = setup(<ChatFileTray files={[{ localId: "file", clientUploadId: "upload", file, kind: "audio", progress: 100 }]} onRemove={remove} />);
    expect(screen.getByRole("group", { name: "Audio: voice.webm" })).toBeVisible();
    expect(screen.getByText("Checking audio…")).toBeVisible();
    expect(screen.queryByText("100% uploaded")).not.toBeInTheDocument();
    expect(document.querySelector(".project-chat-file-tray__audio")).toBeInTheDocument();
    expect(document.querySelector("audio[controls]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove voice.webm" })); expect(remove).toHaveBeenCalledWith("file");
    view.unmount();
  });
  it("releases playback when its row leaves history or the selected file is removed", async () => {
    const { controller, view } = setup(<ChatAudioBubble source={{ key: "one", filename: file.name, file }} />);
    await userEvent.click(screen.getByRole("button", { name: "Play voice.webm" }));
    await act(async () => undefined);
    view.unmount(); expect(controller.getSnapshot().key).toBeNull(); expect(audio.removeAttribute).toBeDefined();
    expect(audio.getAttribute("src")).toBeNull();
  });
  it("never formats absent or non-finite duration as a real time", () => {
    expect(audioTime()).toBe("—:—"); expect(audioTime(Infinity)).toBe("—:—"); expect(audioTime(NaN)).toBe("—:—"); expect(audioTime(0)).toBe("0:00"); expect(audioTime(62.8)).toBe("1:02");
  });
});
