/**
 * Ordenación de la tabla de Resultados y del grid de la barra. Fuera de los
 * componentes para poder probarla: la tabla es lo primero que Nicolas va a
 * mirar en el ordenador, y el grid es lo primero que ve el barista.
 */
import { CATEGORIES } from '../data/seed';
import type { Category, Product } from '../data/types';

export type Direccion = 'asc' | 'desc';

/* ---------------- Grid de la barra ---------------- */

const RANGO_CATEGORIA = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]));

/** Una categoría que no esté en la lista de la carta cae al final, no en medio. */
const rango = (category: string): number => RANGO_CATEGORIA.get(category) ?? CATEGORIES.length;

/**
 * El orden de los tiles del grid continuo: primero por categoría (la de la
 * carta, no la alfabética) y dentro de cada una por `sortOrder`. Sin filas de
 * encabezado, el orden es lo único que agrupa, así que tiene que ser estable
 * aunque en Ajustes se cree una bebida con un `sortOrder` cualquiera.
 */
export function ordenarTiles(items: Product[]): Product[] {
  return [...items].sort((a, b) => {
    const porCategoria = rango(a.category) - rango(b.category);
    if (porCategoria !== 0) return porCategoria;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.shortName.localeCompare(b.shortName, 'es');
  });
}

/** Las categorías que de verdad tienen bebidas, en el orden en que salen en el grid. */
export function categoriasDe(items: Product[]): Category[] {
  const vistas: Category[] = [];
  for (const p of ordenarTiles(items)) if (!vistas.includes(p.category)) vistas.push(p.category);
  return vistas;
}

/* ---------------- Tabla de Resultados ---------------- */

/**
 * Ordena por una columna sin tocar el array original. Los números se comparan
 * como números; el texto, con las reglas del castellano (para que «Ó» caiga
 * donde toca y no al final).
 */
export function ordenarPor<T>(filas: T[], key: keyof T, dir: Direccion): T[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
    return String(x).localeCompare(String(y), 'es') * factor;
  });
}

/**
 * Qué dirección toca al tocar una cabecera: la primera vez, la más útil de esa
 * columna (los números empiezan de mayor a menor, el texto de la A a la Z);
 * después, se invierte.
 */
export function siguienteOrden<T>(
  actual: { key: T; dir: Direccion },
  key: T,
  esTexto: boolean,
): { key: T; dir: Direccion } {
  if (actual.key === key) return { key, dir: actual.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: esTexto ? 'asc' : 'desc' };
}
