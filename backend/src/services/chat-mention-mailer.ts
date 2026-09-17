export interface ChatMentionEmailInput {
  notificationId: string;
  recipient: { name: string; email: string };
  actorName: string;
  projectName: string;
  projectId: string;
  messageId: string;
  excerpt: string;
  kind: "chat.mention" | "chat.mention.oversight";
}

export interface EnabledChatMentionMailer {
  sendMention(input: ChatMentionEmailInput): Promise<void>;
}

export type ChatMentionMailer =
  | { readonly deliveryKind: "disabled" }
  | (EnabledChatMentionMailer & {
      readonly deliveryKind: "external" | "local_test";
    });
