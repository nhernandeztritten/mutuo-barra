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

/**
 * Tope de la pila. En modo un toque se sirve una bebida por toque y sin tope la
 * pantalla se llena de avisos idénticos; el «Deshacer» que importa es el último.
 */
const MAX_TOASTS = 3;

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

/** Vacía la cola. Se usa al salir de la barra y entre pruebas. */
export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  toasts.value = [];
}

/** @param timeout ms on screen; 8000 for the undo window. */
export function showToast(message: string, action: ToastAction | null = null, timeout = 8000): number {
  const id = ++nextId;
  const queue = [...toasts.value, { id, message, action, timeout }];
  for (const stale of queue.slice(0, Math.max(0, queue.length - MAX_TOASTS))) {
    const timer = timers.get(stale.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(stale.id);
    }
  }
  toasts.value = queue.slice(-MAX_TOASTS);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), timeout),
  );
  return id;
}
