/**
 * Instalar la app en la pantalla de inicio del dispositivo.
 *
 * No es cosmético y por eso tiene su propio archivo: instalada, iOS deja de
 * tratar los datos de la app como desechables. Sin instalar y sin permiso de
 * almacenamiento persistente, Safari puede vaciar IndexedDB tras siete días sin
 * usarla — que es exactamente lo que pasa entre boda y boda.
 *
 * En iOS no hay `beforeinstallprompt`: no se puede ofrecer un botón que
 * instale. Lo único honesto es enseñar los pasos de Safari.
 *
 * Aquí vive también **cómo se llama el aparato que tienes delante**: el aviso
 * decía «Instala la app en el iPad» y mañana la barra la lleva un iPhone.
 */

/** Los pasos, tal cual se dicen en Eventos y en Ajustes. */
export const PASOS_INSTALACION: readonly string[] = [
  'Abre la app en Safari (no en otro navegador).',
  'Toca Compartir, el cuadrado con la flecha hacia arriba.',
  'Baja hasta «Añadir a pantalla de inicio» y confirma.',
  'A partir de ahí, abre siempre la app desde su icono.',
];

/**
 * @returns `true` si la app se abrió desde el icono de la pantalla de inicio.
 *   `navigator.standalone` es la vía de las versiones viejas de iPadOS.
 */
export function estaInstalada(): boolean {
  const nav = globalThis.navigator as Navigator & { standalone?: boolean };
  if (nav?.standalone === true) return true;
  return globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Lo que dice Ajustes sobre el estado actual. */
export function estadoInstalacion(): 'instalada' | 'safari' {
  return estaInstalada() ? 'instalada' : 'safari';
}

/** Cómo se llama el aparato en el que corre la app. */
export type Dispositivo = 'iPhone' | 'iPad' | 'dispositivo';

/**
 * Qué aparato es este.
 *
 * `iPad` tiene dos caminos porque desde iPadOS 13 Safari miente y se presenta
 * como un Mac; lo que lo delata es que un Mac de verdad no tiene cinco puntos
 * de contacto. Si no hay manera de saberlo, se dice «dispositivo» y ya está:
 * inventarse un nombre para la pantalla que alguien tiene en la mano es peor
 * que no decirlo.
 */
export function dispositivo(): Dispositivo {
  const nav = globalThis.navigator as (Navigator & { maxTouchPoints?: number }) | undefined;
  const ua = nav?.userAgent ?? '';
  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1) return 'iPad';
  return 'dispositivo';
}

/** «este iPhone», «este iPad» o «este dispositivo», para meterlo en una frase. */
export function esteDispositivo(): string {
  return `este ${dispositivo()}`;
}
