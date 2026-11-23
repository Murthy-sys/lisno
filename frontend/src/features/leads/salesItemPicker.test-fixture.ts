import { screen, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

type User = ReturnType<typeof userEvent.setup>;

export function pickerSelect(label: "Main Basket" | "Sub Basket" | "Main Line") {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: label });
}

export async function selectPickerBranch(user: User, basket: string, subBasket: string) {
  await user.selectOptions(pickerSelect("Main Basket"), basket);
  await user.selectOptions(pickerSelect("Sub Basket"), subBasket);
  return pickerSelect("Main Line");
}

export async function selectPickerLine(user: User, basket: string, subBasket: string, line: string) {
  const lines = await selectPickerBranch(user, basket, subBasket);
  await user.selectOptions(lines, within(lines).getByRole("option", { name: line }));
  return screen.getByRole("button", { name: "Add" });
}
