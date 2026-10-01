import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

type User = ReturnType<typeof userEvent.setup>;

export async function openFurnitureRoom(user: User, roomName: string) {
  const room = screen.getByRole("group", { name: `${roomName} dimensions` });
  const toggle = room.querySelector<HTMLButtonElement>(".furniture-dimensions-editor__room-toggle")!;
  if (toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);
  return within(room);
}

export async function openFurnitureItem(user: User, roomName: string, itemName: string) {
  const room = await openFurnitureRoom(user, roomName);
  const item = room.getByRole("group", { name: `${itemName} measurements` });
  const toggle = item.querySelector<HTMLButtonElement>(".furniture-dimensions-editor__item-toggle")!;
  if (toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);
  return within(item);
}
