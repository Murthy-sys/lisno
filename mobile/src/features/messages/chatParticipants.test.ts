import { ApiProtocolError } from "../../core/http/apiClient";
import {
  CHAT_PARTICIPANT_OPTION_LIMIT,
  CHAT_PARTICIPANT_SEARCH_MAX_LENGTH,
  buildChatParticipantOptionsPath,
  buildChatParticipantsPath,
  normalizeChatParticipantSearch,
  requireChatParticipantOptions,
  requireChatParticipantPage
} from "./chatParticipants";

describe("mobile chat participant data boundary", () => {
  it("builds an encoded participant page path from the raw stable project ID", () => {
    expect(buildChatParticipantsPath("project/a & b")).toBe("/projects/project%2Fa%20%26%20b/chat/participants");
  });

  it("trims, bounds, and encodes options search exactly once", () => {
    expect(buildChatParticipantOptionsPath("project/a", "  Asha & Rao/Lead  ")).toBe(
      `/projects/project%2Fa/chat/participant-options?search=Asha+%26+Rao%2FLead&limit=${CHAT_PARTICIPANT_OPTION_LIMIT}`
    );
    expect(buildChatParticipantOptionsPath("project/a", "  ")).toBe(
      `/projects/project%2Fa/chat/participant-options?limit=${CHAT_PARTICIPANT_OPTION_LIMIT}`
    );

    const overlong = `  ${"x".repeat(CHAT_PARTICIPANT_SEARCH_MAX_LENGTH + 10)}  `;
    expect(normalizeChatParticipantSearch(overlong)).toBe("x".repeat(CHAT_PARTICIPANT_SEARCH_MAX_LENGTH));
    expect(new URL(buildChatParticipantOptionsPath("project-a", overlong), "https://lisno.invalid").searchParams.get("search"))
      .toHaveLength(CHAT_PARTICIPANT_SEARCH_MAX_LENGTH);
  });

  it("returns validated page and option payloads", () => {
    expect(requireChatParticipantPage({
      items: [{ id: "user-a", name: "Asha Rao", role: "admin", sources: [], selection: null }],
      setupWarnings: []
    }).items[0]?.id).toBe("user-a");
    expect(requireChatParticipantOptions({
      items: [{ id: "user-b", name: "Dev Rao", role: "designer" }],
      hasMore: false
    }).items[0]?.id).toBe("user-b");
  });

  it("raises a protocol error before malformed participant data reaches a consumer", () => {
    expect(() => requireChatParticipantPage({
      items: [{ id: "user-a", name: "Asha Rao", role: "admin", sources: [], selection: { id: "s", version: 0 } }],
      setupWarnings: []
    })).toThrow(ApiProtocolError);
    expect(() => requireChatParticipantOptions({ items: [], hasMore: 1 })).toThrow(ApiProtocolError);
  });
});
