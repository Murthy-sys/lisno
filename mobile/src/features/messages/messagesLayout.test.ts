import { messagesLayout } from "./messagesLayout";

describe("messages workspace layout", () => {
  it("uses an immersive single-pane thread below 600dp", () => {
    expect(messagesLayout(320)).toEqual({ mode: "phone", conversationPaneWidth: null });
    expect(messagesLayout(599)).toEqual({ mode: "phone", conversationPaneWidth: null });
  });

  it("keeps both messaging panes useful across expanded Android widths", () => {
    expect(messagesLayout(600)).toEqual({ mode: "split", conversationPaneWidth: 248 });
    expect(messagesLayout(839)).toEqual({ mode: "split", conversationPaneWidth: 248 });
    expect(messagesLayout(840)).toEqual({ mode: "split", conversationPaneWidth: 288 });
    expect(messagesLayout(1024)).toEqual({ mode: "split", conversationPaneWidth: 336 });
  });
});
