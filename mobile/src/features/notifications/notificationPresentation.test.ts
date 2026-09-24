import { colors } from "../../ui/tokens";
import {
  type ChatNotification,
  formatNotificationTime,
  groupNotifications,
  notificationAccessibilityLabel,
  notificationMessage,
  notificationTone,
  parseNotifications
} from "./notificationPresentation";

// Local-time constructors keep the fixed clock independent of the machine time zone.
const NOW = new Date(2026, 8, 24, 15, 0);

function iso(year: number, month: number, day: number, hours: number, minutes: number): string {
  return new Date(year, month, day, hours, minutes).toISOString();
}

function item(overrides: Partial<ChatNotification> = {}): ChatNotification {
  return {
    id: "n-1",
    type: "chat.mention",
    projectId: "p-1",
    projectName: "Villa Aurora",
    messageId: "m-1",
    actor: { id: "u-2", name: "Asha Rao" },
    excerpt: "Please review the kitchen layout",
    createdAt: iso(2026, 8, 24, 13, 20),
    readAt: null,
    ...overrides
  };
}

describe("parseNotifications", () => {
  it("reads the unwrapped page and the raw envelope, skipping malformed entries", () => {
    const valid = item();
    const items = [valid, { ...valid, id: "" }, { ...valid, id: "n-2", actor: null }, { ...valid, id: "n-3", createdAt: "not a date" }, { ...valid, id: "n-4", readAt: 5 }, "junk"];
    expect(parseNotifications({ items, unreadCount: 1 })).toEqual([valid]);
    expect(parseNotifications({ data: { items, unreadCount: 1 } })).toEqual([valid]);
    expect(parseNotifications(null)).toEqual([]);
    expect(parseNotifications({ items: "nope" })).toEqual([]);
  });

  it("keeps only contract fields", () => {
    const [parsed] = parseNotifications({ items: [{ ...item(), extra: "ignored", actor: { id: "u-2", name: "Asha Rao", email: "x" } }] });
    expect(parsed).toEqual(item());
  });
});

describe("groupNotifications", () => {
  it("splits at local midnight, sorts newest first and drops empty groups", () => {
    const todayEarly = item({ id: "t1", createdAt: iso(2026, 8, 24, 0, 0) });
    const todayLate = item({ id: "t2", createdAt: iso(2026, 8, 24, 14, 59) });
    const yesterdayLate = item({ id: "y1", createdAt: iso(2026, 8, 23, 23, 59) });
    const yesterdayEarly = item({ id: "y2", createdAt: iso(2026, 8, 23, 0, 0) });
    const earlier = item({ id: "e1", createdAt: iso(2026, 8, 22, 23, 59) });
    const groups = groupNotifications([yesterdayEarly, todayEarly, earlier, todayLate, yesterdayLate], NOW);
    expect(groups.map((group) => [group.label, group.items.map((entry) => entry.id)])).toEqual([
      ["Today", ["t2", "t1"]],
      ["Yesterday", ["y1", "y2"]],
      ["Earlier", ["e1"]]
    ]);
    expect(groupNotifications([earlier], NOW).map((group) => group.label)).toEqual(["Earlier"]);
    expect(groupNotifications([], NOW)).toEqual([]);
  });

  it("handles month boundaries for yesterday", () => {
    const now = new Date(2026, 9, 1, 9, 0);
    const groups = groupNotifications([item({ id: "y", createdAt: iso(2026, 8, 30, 20, 0) })], now);
    expect(groups.map((group) => group.label)).toEqual(["Yesterday"]);
  });
});

describe("formatNotificationTime", () => {
  it("formats today, yesterday and earlier with the year", () => {
    expect(formatNotificationTime(iso(2026, 8, 24, 13, 20), NOW)).toBe("1:20 PM");
    expect(formatNotificationTime(iso(2026, 8, 24, 0, 5), NOW)).toBe("12:05 AM");
    expect(formatNotificationTime(iso(2026, 8, 23, 18, 15), NOW)).toBe("Yesterday, 6:15 PM");
    expect(formatNotificationTime(iso(2026, 8, 20, 9, 0), NOW)).toBe("Sep 20, 2026");
    expect(formatNotificationTime(iso(2025, 11, 31, 9, 0), NOW)).toBe("Dec 31, 2025");
  });
});

describe("notificationTone", () => {
  it("maps known types to tokens and falls back for unknown types", () => {
    expect(notificationTone("chat.mention")).toEqual({ icon: "chat", tile: colors.primarySoft, iconColor: colors.primary });
    expect(notificationTone("chat.mention.oversight")).toEqual({ icon: "chat", tile: colors.infoSoft, iconColor: colors.info });
    expect(notificationTone("stage.approved")).toEqual({ icon: "notifications", tile: colors.surfaceMuted, iconColor: colors.inkMuted });
  });
});

describe("notificationMessage and accessibility label", () => {
  it("uses mention and oversight copy from server fields only", () => {
    expect(notificationMessage(item())).toBe("Asha Rao mentioned you: Please review the kitchen layout");
    expect(notificationMessage(item({ type: "chat.mention.oversight" }))).toBe("Asha Rao mentioned a team member: Please review the kitchen layout");
    expect(notificationMessage(item({ type: "future.type" }))).toBe("Asha Rao: Please review the kitchen layout");
  });

  it("announces unread state only for unread items", () => {
    expect(notificationAccessibilityLabel(item(), NOW)).toBe("Unread, Villa Aurora, Asha Rao mentioned you: Please review the kitchen layout, 1:20 PM");
    expect(notificationAccessibilityLabel(item({ readAt: iso(2026, 8, 24, 14, 0) }), NOW)).toBe("Villa Aurora, Asha Rao mentioned you: Please review the kitchen layout, 1:20 PM");
  });
});
