/**
 * Señales de disposición. `barMode` lo enciende la pantalla de barra al montarse:
 * el shell esconde la navegación y quita el relleno para que la barra ocupe el
 * iPad entero, sin scroll de página (DESIGN.md · Layout de la barra).
 *
 * `esMovil` es el otro eje: por debajo de 560 px la app se dibuja para una mano
 * —un iPhone detrás de la barra— y no para un iPad en su soporte. Casi todo el
 * cambio es CSS; esta señal está solo para las tres cosas que el CSS no puede
 * hacer, que son cambiar un texto («Carta y ajustes» → «Ajustes») y decidir qué
 * controles viven en la hoja «Más».
 */
import { signal } from '@preact/signals';

export const barMode = signal(false);

/** El punto de corte entre «móvil» y todo lo demás. Ver DESIGN.md. */
export const MOVIL_MAX = 560;

const CONSULTA_MOVIL = `(max-width: ${String(MOVIL_MAX)}px)`;

/**
 * `true` en un iPhone en vertical (402 px) y en cualquier pantalla igual de
 * estrecha. En el iPad, en los dos giros, es `false`: 1180 y 820 están por
 * encima del corte, así que su disposición no se toca.
 */
export const esMovil = signal(false);

/**
 * Engancha la señal al ancho real. Se llama una sola vez, al arrancar la app.
 * Devuelve la función que la desengancha, para las pruebas.
 *
 * Fuera del navegador (jsdom, sin `matchMedia`) contesta que no: las pruebas de
 * siempre siguen viendo la disposición de iPad y las de móvil ponen la señal a
 * mano.
 */
export function observarMovil(): () => void {
  const mq = globalThis.matchMedia?.(CONSULTA_MOVIL);
  if (!mq) return () => undefined;
  esMovil.value = mq.matches;
  const alCambiar = (e: MediaQueryListEvent): void => {
    esMovil.value = e.matches;
  };
  // `addListener` es la vía de las versiones viejas de Safari, que es
  // exactamente el navegador que va a abrir esto.
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', alCambiar);
  else mq.addListener?.(alCambiar);
  return () => {
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', alCambiar);
    else mq.removeListener?.(alCambiar);
  };
}
