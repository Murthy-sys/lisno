export type MessagesLayout =
  | { readonly mode: "phone"; readonly conversationPaneWidth: null }
  | { readonly mode: "split"; readonly conversationPaneWidth: number };

export function messagesLayout(width: number): MessagesLayout {
  if (width < 600) {
    return { mode: "phone", conversationPaneWidth: null };
  }
  if (width < 840) {
    return { mode: "split", conversationPaneWidth: 248 };
  }
  if (width < 1024) {
    return { mode: "split", conversationPaneWidth: 288 };
  }
  return { mode: "split", conversationPaneWidth: 336 };
}
