/**
 * Toast queue. The bar never asks «¿estás seguro?»: it serves and offers
 * «Deshacer» here for 8 s (SPEC §3.2 regla 5).
 */
import { signal } from '@preact/signals';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  action: ToastAction | null;
  timeout: number;
}

export const toasts = signal<ToastItem[]>([]);

let nextId = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/** @param timeout ms on screen; 8000 for the undo window. */
export function showToast(message: string, action: ToastAction | null = null, timeout = 8000): number {
  const id = ++nextId;
  toasts.value = [...toasts.value, { id, message, action, timeout }];
  timers.set(
    id,
    setTimeout(() => dismissToast(id), timeout),
  );
  return id;
}
