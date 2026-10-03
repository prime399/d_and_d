// Tiny event bridge so any component (e.g. the header) can open the Credits modal.
export const CREDITS_EVENT = 'dd:open-credits';

export function openCredits() {
  window.dispatchEvent(new Event(CREDITS_EVENT));
}
