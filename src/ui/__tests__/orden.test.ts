/** Ordenación de la tabla de eventos cerrados (SPEC §3.5). */
import { describe, expect, it } from 'vitest';
import { categoriasDe, ordenarPor, ordenarTiles, siguienteOrden } from '../orden';
import { PRODUCTS } from '../../data/seed';
import type { Product } from '../../data/types';

const FILAS = [
  { nombre: 'Boda Ana y Marc', bebidas: 142, coste: 0.84 },
  { nombre: 'Mercado de Ruzafa', bebidas: 38, coste: 0.75 },
  { nombre: 'Ávila, rodaje', bebidas: 96, coste: 1.02 },
];

describe('ordenarPor', () => {
  it('ordena números de menor a mayor y al revés', () => {
    expect(ordenarPor(FILAS, 'bebidas', 'asc').map((f) => f.bebidas)).toEqual([38, 96, 142]);
    expect(ordenarPor(FILAS, 'bebidas', 'desc').map((f) => f.bebidas)).toEqual([142, 96, 38]);
  });

  it('ordena texto con las reglas del castellano: la Á va con la A', () => {
    expect(ordenarPor(FILAS, 'nombre', 'asc').map((f) => f.nombre)).toEqual([
      'Ávila, rodaje',
      'Boda Ana y Marc',
      'Mercado de Ruzafa',
    ]);
  });

  it('compara decimales como números, no como texto', () => {
    expect(ordenarPor(FILAS, 'coste', 'asc').map((f) => f.coste)).toEqual([0.75, 0.84, 1.02]);
  });

  it('no toca el array original', () => {
    const copia = [...FILAS];
    ordenarPor(FILAS, 'bebidas', 'asc');
    expect(FILAS).toEqual(copia);
  });
});

describe('siguienteOrden', () => {
  it('una columna nueva de números empieza de mayor a menor', () => {
    expect(siguienteOrden({ key: 'nombre', dir: 'asc' }, 'bebidas', false)).toEqual({
      key: 'bebidas',
      dir: 'desc',
    });
  });

  it('una columna nueva de texto empieza de la A a la Z', () => {
    expect(siguienteOrden({ key: 'bebidas', dir: 'desc' }, 'nombre', true)).toEqual({
      key: 'nombre',
      dir: 'asc',
    });
  });

  it('tocar dos veces la misma columna la invierte', () => {
    const uno = siguienteOrden({ key: 'nombre', dir: 'asc' }, 'bebidas', false);
    const dos = siguienteOrden(uno, 'bebidas', false);
    expect(dos.dir).toBe('asc');
    expect(siguienteOrden(dos, 'bebidas', false).dir).toBe('desc');
  });
});

describe('orden del grid de la barra', () => {
  it('agrupa por categoría en el orden de la carta, no en el alfabético', () => {
    const cats = ordenarTiles(PRODUCTS).map((p) => p.category);
    expect([...new Set(cats)]).toEqual([
      'Espresso',
      'Con leche',
      'Filtro',
      'Fríos',
      'Especiales',
      'Otros',
    ]);
  });

  it('dentro de una categoría manda sortOrder', () => {
    const conLeche = ordenarTiles(PRODUCTS)
      .filter((p) => p.category === 'Con leche')
      .map((p) => p.sortOrder);
    expect(conLeche).toEqual([...conLeche].sort((a, b) => a - b));
  });

  it('una bebida creada en Ajustes cae en su categoría, no al final', () => {
    const nueva = {
      ...PRODUCTS[0]!,
      id: 'nuevo',
      shortName: 'Nuevo',
      category: 'Filtro',
      sortOrder: 999,
    } as Product;
    const ids = ordenarTiles([...PRODUCTS, nueva]).map((p) => p.id);
    expect(ids.indexOf('nuevo')).toBeGreaterThan(ids.indexOf('filtro'));
    expect(ids.indexOf('nuevo')).toBeLessThan(ids.indexOf('cold_brew'));
  });

  it('no toca el array original', () => {
    const copia = [...PRODUCTS];
    ordenarTiles(PRODUCTS);
    expect(PRODUCTS).toEqual(copia);
  });

  it('la leyenda solo nombra las categorías que tienen bebidas', () => {
    const sinOtros = PRODUCTS.filter((p) => p.category !== 'Otros');
    expect(categoriasDe(sinOtros)).toEqual([
      'Espresso',
      'Con leche',
      'Filtro',
      'Fríos',
      'Especiales',
    ]);
  });
});
