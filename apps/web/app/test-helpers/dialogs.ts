import { act } from "react";

export function mockNativeDialogs() {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}

export function openDecision(container: ParentNode) {
  const dialog = container.querySelector<HTMLDialogElement>(".decision-dialog[open]");
  if (!dialog) throw new Error("Expected an open confirmation dialog");
  return dialog;
}

export async function respondToDecision(container: ParentNode, accept: boolean) {
  const dialog = openDecision(container);
  const action = dialog.querySelector<HTMLButtonElement>(accept ? 'button[type="submit"]' : 'button[type="button"]');
  if (!action || action.disabled) throw new Error("Expected an enabled confirmation action");
  await act(async () => action.click());
}
