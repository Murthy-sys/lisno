import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatParticipants } from "./ChatParticipants";
import { chatTestPeople } from "./projectChatFixtures";
import { LISNO_AI } from "./projectChatAssistantTypes";

describe("project chat assistant participant branding", () => {
  it.each([true, false])("brands the service participant when availability is %s", (available) => {
    render(<ChatParticipants projectId="project-a" participants={chatTestPeople} warnings={[]} canManage={false} assistant={{ ...LISNO_AI, available }} />);
    const assistant = screen.getByRole("region", { name: "Project AI assistant" });
    expect(within(assistant).getByText("Lisno AI")).toBeVisible();
    const mark = assistant.querySelector("img.lisno-chat-mark")!;
    expect(mark).toHaveAttribute("src", "/lisno-chat-mark.svg");
    expect(mark).toHaveAttribute("alt", "");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText(/Read-only project information|AI replies are currently unavailable/)).not.toBeInTheDocument();
    fireEvent.error(mark);
    expect(within(assistant).getByText("Lisno AI")).toBeVisible();
    expect(assistant.querySelector("img")).toBeNull();
  });

  it("does not brand a human participant named Lisno AI", () => {
    render(<ChatParticipants projectId="project-a" participants={[{ ...chatTestPeople[0], id: "lisno-ai", name: "Lisno AI", kind: "human" }]} warnings={[]} canManage={false} />);
    expect(screen.getByText("Lisno AI")).toBeVisible();
    expect(document.querySelector(".lisno-chat-mark")).toBeNull();
    expect(screen.queryByRole("region", { name: "Project AI assistant" })).not.toBeInTheDocument();
  });
});
