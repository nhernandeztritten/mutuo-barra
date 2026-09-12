/**
 * Toast queue. The bar never asks «¿estás seguro?»: it serves and offers
 * «Deshacer» here for 8 s (SPEC §3.2 regla 5).
 */
import { signal } from '@preact/signals';
import { esMovil } from './layout';

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
 * pantalla se llena de avisos idénticos; el «Deshacer» que importa es el
 * último.
 *
 * En un móvil el tope baja a **dos**: la pantalla mide 402 px de ancho y la
 * pila crece hacia arriba justo encima de la barra del pedido. Con tres, el
 * tercero llegaba a tapar la fila de extras. En el iPad se quedan tres.
 */
export function maxToasts(): number {
  return esMovil.value ? 2 : 3;
}

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

/** Aviso informativo: 3 s. Lo justo para leerlo sin taparle la barra al barista. */
export const TOAST_INFO_MS = 3000;
/** Aviso con acción («· Deshacer»): 8 s, el tiempo de reaccionar a un error. */
export const TOAST_ACTION_MS = 8000;

/**
 * @param timeout ms en pantalla. Por defecto 3 s, u 8 s si el aviso lleva acción:
 *   un «Deshacer» que se va en tres segundos no sirve de nada.
 */
export function showToast(
  message: string,
  action: ToastAction | null = null,
  timeout = action ? TOAST_ACTION_MS : TOAST_INFO_MS,
): number {
  const id = ++nextId;
  const tope = maxToasts();
  const queue = [...toasts.value, { id, message, action, timeout }];
  for (const stale of queue.slice(0, Math.max(0, queue.length - tope))) {
    const timer = timers.get(stale.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(stale.id);
    }
  }
  toasts.value = queue.slice(-tope);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), timeout),
  );
  return id;
}
