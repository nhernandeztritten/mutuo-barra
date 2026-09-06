/**
 * Navegación con base configurable.
 *
 * La app se puede publicar en la raíz de un dominio (Vercel, dominio propio) o
 * colgando de una carpeta (GitHub Pages: `/mutuo-barra/`). `preact-iso` compara
 * la ruta del navegador tal cual, así que sin esto, publicada en una carpeta,
 * ninguna ruta encajaría y todo caería en «Aquí no hay nada».
 *
 * Regla: **dentro del código las rutas se escriben siempre desde la raíz**
 * (`/evento/:id`). La base se pega justo en los dos sitios donde la ruta sale
 * al navegador —el `href` de un enlace y el `route()` de un salto— y se quita
 * en el único donde entra: comparar en qué sección estamos.
 */
import { useCallback } from 'preact/hooks';
import { useLocation } from 'preact-iso';

/** Lo inyecta `vite.config.ts` desde `VITE_BASE`. Siempre con barra al final. */
export const BASE: string = typeof __APP_BASE__ === 'string' ? __APP_BASE__ : '/';

/**
 * `/evento/abc` → `/mutuo-barra/evento/abc`. En la raíz no toca nada.
 *
 * Sin barra al final, porque `preact-iso` normaliza la ruta del navegador
 * quitándosela y las dos tienen que compararse igual: la raíz de una app en
 * carpeta es `/mutuo-barra`, no `/mutuo-barra/`.
 */
export function conBaseDe(base: string, ruta: string): string {
  if (base === '/') return ruta;
  const completa = `${base.replace(/\/+$/, '')}${ruta}`;
  return completa.length > 1 ? completa.replace(/\/+$/, '') : completa;
}

/** `/mutuo-barra/evento/abc` → `/evento/abc`. Lo de fuera de la base no se toca. */
export function sinBaseDe(base: string, ruta: string): string {
  if (base === '/') return ruta;
  const prefijo = base.replace(/\/+$/, '');
  if (ruta !== prefijo && !ruta.startsWith(`${prefijo}/`)) return ruta;
  return ruta.slice(prefijo.length) || '/';
}

export const conBase = (ruta: string): string => conBaseDe(BASE, ruta);
export const sinBase = (ruta: string): string => sinBaseDe(BASE, ruta);

/**
 * `route()` con la base ya puesta. Sustituye a `useLocation().route` en las
 * pantallas, para que ninguna tenga que acordarse de dónde está publicada.
 */
export function useIr(): (url: string, replace?: boolean) => void {
  const { route } = useLocation();
  return useCallback((url: string, replace?: boolean) => route(conBase(url), replace), [route]);
}
