/**
 * Instalar la app en la pantalla de inicio del iPad.
 *
 * No es cosmético y por eso tiene su propio archivo: instalada, iPadOS deja de
 * tratar los datos de la app como desechables. Sin instalar y sin permiso de
 * almacenamiento persistente, Safari puede vaciar IndexedDB tras siete días sin
 * usarla — que es exactamente lo que pasa entre boda y boda.
 *
 * En iPadOS no hay `beforeinstallprompt`: no se puede ofrecer un botón que
 * instale. Lo único honesto es enseñar los pasos de Safari.
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
